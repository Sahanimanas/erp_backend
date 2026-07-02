import { db } from '@common/database/client';

export class DashboardService {
  async getStats(schoolId: string, opts?: { startDate?: string; endDate?: string }) {
    // Optional date-range filter. When provided, the time-based metrics (fee
    // collection + attendance) are scoped to [rangeStart, rangeEnd]; otherwise
    // they default to "current month" / "today" as before.
    const hasRange = !!(opts?.startDate || opts?.endDate);
    const _now = new Date();
    const rangeStart = opts?.startDate
      ? new Date(opts.startDate)
      : new Date(_now.getFullYear(), _now.getMonth(), 1);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = opts?.endDate
      ? new Date(opts.endDate)
      : new Date(_now.getFullYear(), _now.getMonth() + 1, 0);
    rangeEnd.setHours(23, 59, 59, 999);
    // Attendance windows computed up-front so everything runs in ONE batch.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const attStart = hasRange ? rangeStart : today;
    const attEnd = hasRange ? rangeEnd : tomorrow;
    const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const weekWindows: { day: string; gte: Date; lt: Date }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0);
      const nd = new Date(d); nd.setDate(nd.getDate() + 1);
      weekWindows.push({ day: dayLabels[d.getDay() === 0 ? 6 : d.getDay() - 1], gte: d, lt: nd });
    }

    const N = (v: any) => Number(v ?? 0);

    // ── Single parallel batch ──────────────────────────────────────────────
    // Counts, fee/accounting data (lightweight selects), attendance (today +
    // 7 concurrent day buckets) and recents — all fired at once instead of
    // ~15 sequential round-trips. Fees stay synced with the live workflow:
    // demand = class fee structure × students (+EXTRA −DISCOUNT) + legacy
    // collections; collected = FeePayment(PAID) + legacy COMPLETED.
    // Weekly day-buckets fired concurrently (kept separate so the main batch
    // stays a typed tuple).
    const weekAttendancePromise = Promise.all(
      weekWindows.map((w) =>
        db.studentAttendance.groupBy({ by: ['status'], where: { schoolId, date: { gte: w.gte, lt: w.lt } }, _count: true })
      )
    );

    const [
      studentCount, employeeCount, teacherCount, parentCount,
      allStudents, structures, feePayments, oldFeeColls, transactions,
      todayAttendance, recentStudents,
    ] = await Promise.all([
      db.student.count({ where: { schoolId } }),
      db.employee.count({ where: { schoolId } }),
      db.user.count({ where: { schoolId, role: 'TEACHER' } }),
      db.parent.count({ where: { schoolId } }),
      db.student.findMany({ where: { schoolId, deletedAt: null }, select: { section: { select: { classId: true } } } }),
      db.classFeeStructure.findMany({ where: { schoolId, enabled: true, feeType: { deletedAt: null } }, include: { feeType: true } }),
      db.feePayment.findMany({ where: { schoolId }, select: { id: true, amount: true, discount: true, fine: true, kind: true, paidDate: true, studentId: true, month: true, mode: true, feeTypeName: true, receiptNo: true } }),
      db.feeCollection.findMany({ where: { schoolId }, select: { amount: true, status: true, createdAt: true } }),
      db.transaction.findMany({ where: { schoolId }, select: { type: true, amount: true } }),
      db.studentAttendance.groupBy({ by: ['status'], where: { schoolId, date: { gte: attStart, lt: attEnd } }, _count: true }),
      db.student.findMany({
        where: { schoolId }, orderBy: { createdAt: 'desc' }, take: 3,
        select: {
          id: true, createdAt: true, rollNumber: true, admissionNumber: true,
          admissionDate: true, gender: true,
          user: { select: { firstName: true, lastName: true, phone: true, email: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
      }),
    ]);
    const weekAttendance = await weekAttendancePromise;

    const studentsPerClass: Record<string, number> = {};
    for (const s of allStudents) {
      const cid = s.section?.classId;
      if (cid) studentsPerClass[cid] = (studentsPerClass[cid] || 0) + 1;
    }
    // A class can now carry per-session fee rows (academicYearId). Keep just one
    // row per (class, fee type) — preferring the active session, then a legacy
    // null-session row — so demand isn't multiplied across sessions.
    const activeYear = await db.academicYear.findFirst({ where: { schoolId, isActive: true }, select: { id: true } });
    const activeYearId = activeYear?.id ?? null;
    const rankStruct = (r: any) => (r.academicYearId === activeYearId ? 0 : r.academicYearId === null ? 1 : 2);
    const structByKey = new Map<string, any>();
    for (const st of structures as any[]) {
      const key = `${st.classId}:${st.feeTypeId}`;
      const prev = structByKey.get(key);
      if (!prev || rankStruct(st) < rankStruct(prev)) structByKey.set(key, st);
    }
    let structureDemand = 0;
    for (const st of structByKey.values()) {
      const m = ['Monthly', 'Quarterly'].includes(st.feeType.frequency) ? Math.max(1, st.feeType.months.length) : 1;
      structureDemand += N(st.amount) * m * (studentsPerClass[st.classId] || 0);
    }

    const sumPay = (k: string, field: 'amount' | 'discount' = 'amount') =>
      feePayments.filter((p) => p.kind === k).reduce((s, p) => s + N((p as any)[field]), 0);
    const paidNew = sumPay('PAID');
    const extraNew = sumPay('EXTRA');
    const discountNew = sumPay('DISCOUNT') + sumPay('PAID', 'discount');
    const oldCompleted = oldFeeColls.filter((fc) => fc.status === 'COMPLETED').reduce((s, fc) => s + N(fc.amount), 0);
    const oldTotal = oldFeeColls.reduce((s, fc) => s + N(fc.amount), 0);

    const collectedAll = paidNew + oldCompleted;
    const totalDemand = structureDemand + extraNew - discountNew + oldTotal;
    const pendingAmount = Math.max(0, totalDemand - collectedAll);

    // Collected within the selected range (default current month).
    const collectedFees =
      feePayments.filter((p) => p.kind === 'PAID' && p.paidDate >= rangeStart && p.paidDate <= rangeEnd).reduce((s, p) => s + N(p.amount), 0) +
      oldFeeColls.filter((fc) => fc.status === 'COMPLETED' && fc.createdAt >= rangeStart && fc.createdAt <= rangeEnd).reduce((s, fc) => s + N(fc.amount), 0);
    const totalFees = totalDemand;
    const feePercentage = totalFees > 0 ? Math.round((collectedAll / totalFees) * 100) : 0;

    // Office accounting income/expense (fees collected count as income too).
    const txnIncome = transactions.filter((t) => t.type === 'INCOME').reduce((s, t) => s + N(t.amount), 0);
    const txnExpense = transactions.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + N(t.amount), 0);
    const incomeTotal = collectedAll + txnIncome;
    const expenseTotal = txnExpense;

    // Attendance summary (prefetched above).
    const presentCount = todayAttendance.find((a) => a.status === 'PRESENT')?._count || 0;
    const absentCount = todayAttendance.find((a) => a.status === 'ABSENT')?._count || 0;
    const attendancePercentage = presentCount + absentCount > 0
      ? Math.round((presentCount / (presentCount + absentCount)) * 100)
      : 0;

    // Weekly attendance — buckets already fetched concurrently above.
    const weeklyData = weekWindows.map((w, i) => {
      const att = weekAttendance[i] || [];
      return {
        day: w.day,
        present: att.find((a) => a.status === 'PRESENT')?._count || 0,
        absent: att.find((a) => a.status === 'ABSENT')?._count || 0,
      };
    });

    // Monthly fee summary
    const monthlyFees = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - i);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

      const monthEnd2 = new Date(monthEnd);
      monthEnd2.setHours(23, 59, 59, 999);
      const monthCollected =
        feePayments.filter((p) => p.kind === 'PAID' && p.paidDate >= monthStart && p.paidDate <= monthEnd2).reduce((s, p) => s + N(p.amount), 0) +
        oldFeeColls.filter((fc) => fc.status === 'COMPLETED' && fc.createdAt >= monthStart && fc.createdAt <= monthEnd2).reduce((s, fc) => s + N(fc.amount), 0);
      const monthTotal = Math.round(totalDemand / 12); // even split of annual demand as a baseline

      monthlyFees.push({
        month: monthStart.toLocaleString('en-US', { month: 'short' }),
        total: monthTotal,
        collected: Math.round(monthCollected),
        remaining: Math.max(0, monthTotal - Math.round(monthCollected)),
      });
    }

    // Recent activities (recentStudents prefetched above). Each carries a `type`
    // and a structured `details` list so the dashboard can open a detail panel
    // when an activity row is clicked, plus a `ts` for cross-source ordering.
    type Activity = {
      type: 'admission' | 'payment';
      id: string;
      icon: string; bg: string;
      title: string; detail: string; time: string;
      ts: number;
      details: { label: string; value: string }[];
    };
    const activities: Activity[] = [];
    const inr = (v: any) => `₹${N(v).toLocaleString('en-IN')}`;
    recentStudents.forEach((student) => {
      const fullName = `${student.user?.firstName ?? ''} ${student.user?.lastName ?? ''}`.trim();
      const classLabel = [student.section?.class?.name, student.section?.name].filter(Boolean).join(' - ');
      activities.push({
        type: 'admission',
        id: student.id,
        icon: '📋',
        bg: 'bg-indigo-50',
        title: 'New student admitted',
        detail: fullName || 'student',
        time: this.timeAgo(student.createdAt || new Date()),
        ts: new Date(student.createdAt || new Date()).getTime(),
        details: [
          { label: 'Student Name', value: fullName || '—' },
          { label: 'Class', value: classLabel || '—' },
          { label: 'Roll Number', value: student.rollNumber || '—' },
          { label: 'Admission No', value: student.admissionNumber || '—' },
          { label: 'Gender', value: student.gender || '—' },
          { label: 'Phone', value: student.user?.phone || '—' },
          { label: 'Email', value: student.user?.email || '—' },
          { label: 'Admission Date', value: this.fmtDate(student.admissionDate) },
        ],
      });
    });

    // Recent fee payments — from the live FeePayment workflow.
    const recentFeePayments = [...feePayments]
      .filter((p) => p.kind === 'PAID')
      .sort((a, b) => new Date(b.paidDate).getTime() - new Date(a.paidDate).getTime())
      .slice(0, 3);
    const recentSids = [...new Set(recentFeePayments.map((p) => p.studentId))];
    const recentStuds = recentSids.length
      ? await db.student.findMany({
          where: { id: { in: recentSids } },
          include: { user: true, section: { select: { name: true, class: { select: { name: true } } } } },
        })
      : [];
    const studById = new Map(recentStuds.map((s) => [s.id, s]));
    const nameById = new Map(recentStuds.map((s) => [s.id, `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim()]));
    recentFeePayments.forEach((payment) => {
      const stud = studById.get(payment.studentId) as any;
      const name = nameById.get(payment.studentId) || 'student';
      const classLabel = [stud?.section?.class?.name, stud?.section?.name].filter(Boolean).join(' - ');
      activities.push({
        type: 'payment',
        id: payment.id,
        icon: '💰',
        bg: 'bg-emerald-50',
        title: 'Fee payment received',
        detail: `${inr(payment.amount)} from ${name}`,
        time: this.timeAgo(payment.paidDate || new Date()),
        ts: new Date(payment.paidDate || new Date()).getTime(),
        details: [
          { label: 'Student Name', value: name },
          { label: 'Class', value: classLabel || '—' },
          { label: 'Amount Paid', value: inr(payment.amount) },
          { label: 'Discount', value: inr(payment.discount) },
          { label: 'Fine', value: inr(payment.fine) },
          { label: 'Fee Type', value: payment.feeTypeName || '—' },
          { label: 'Month', value: payment.month || '—' },
          { label: 'Mode', value: payment.mode || '—' },
          { label: 'Receipt No', value: payment.receiptNo || '—' },
          { label: 'Paid Date', value: this.fmtDate(payment.paidDate) },
        ],
      });
    });

    // Newest first across both sources.
    activities.sort((a, b) => b.ts - a.ts);

    return {
      students: studentCount,
      employees: employeeCount,
      teachers: teacherCount,
      parents: parentCount,
      feeCollection: {
        collected: Math.round(collectedFees),
        total: Math.round(totalFees),
        percentage: feePercentage,
      },
      pendingFees: Math.round(pendingAmount),
      attendance: {
        present: presentCount,
        absent: absentCount,
        percentage: attendancePercentage,
      },
      monthlyFees,
      incomeExpense: {
        income: Math.round(incomeTotal),
        expense: Math.round(expenseTotal),
      },
      weeklyAttendance: weeklyData,
      activities: activities.slice(0, 5), // Return top 5
    };
  }

  private timeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  private fmtDate(date?: Date | null): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

export default new DashboardService();
