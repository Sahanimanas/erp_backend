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
    // Fetch student count
    const studentCount = await db.student.count({
      where: { schoolId },
    });

    // Fetch employee count
    const employeeCount = await db.employee.count({
      where: { schoolId },
    });

    // Fetch teacher count (employees with TEACHER role)
    const teacherCount = await db.user.count({
      where: { schoolId, role: 'TEACHER' },
    });

    // Fetch parent count
    const parentCount = await db.parent.count({
      where: { schoolId },
    });

    // ── Fees synced with the live workflow ──────────────────────────────────
    // Demand = per-class fee structure × students (+ ad-hoc EXTRA − DISCOUNT) +
    //          legacy fee-collection records. Collected = new FeePayment(PAID) +
    //          legacy fee-collection(COMPLETED). Income/Expense pulls in office
    //          accounting transactions. This keeps the dashboard in sync with
    //          Fee Management, Student/Monthly Fee Payment and Accounting.
    const N = (v: any) => Number(v ?? 0);
    const [allStudents, structures, feePayments, oldFeeColls, transactions] = await Promise.all([
      db.student.findMany({ where: { schoolId, deletedAt: null }, select: { section: { select: { classId: true } } } }),
      db.classFeeStructure.findMany({ where: { schoolId, enabled: true }, include: { feeType: true } }),
      db.feePayment.findMany({ where: { schoolId } }),
      db.feeCollection.findMany({ where: { schoolId } }),
      db.transaction.findMany({ where: { schoolId } }),
    ]);

    const studentsPerClass: Record<string, number> = {};
    for (const s of allStudents) {
      const cid = s.section?.classId;
      if (cid) studentsPerClass[cid] = (studentsPerClass[cid] || 0) + 1;
    }
    let structureDemand = 0;
    for (const st of structures as any[]) {
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

    // Attendance summary — over the selected range when filtered, else today.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attStart = hasRange ? rangeStart : today;
    const attEnd = hasRange ? rangeEnd : tomorrow;

    const todayAttendance = await db.studentAttendance.groupBy({
      by: ['status'],
      where: {
        schoolId,
        date: {
          gte: attStart,
          lt: attEnd,
        },
      },
      _count: true,
    });

    const presentCount = todayAttendance.find((a) => a.status === 'PRESENT')?._count || 0;
    const absentCount = todayAttendance.find((a) => a.status === 'ABSENT')?._count || 0;
    const attendancePercentage = presentCount + absentCount > 0
      ? Math.round((presentCount / (presentCount + absentCount)) * 100)
      : 0;

    // Weekly attendance data
    const weeklyData = [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const attendance = await db.studentAttendance.groupBy({
        by: ['status'],
        where: {
          schoolId,
          date: {
            gte: date,
            lt: nextDate,
          },
        },
        _count: true,
      });

      weeklyData.push({
        day: days[date.getDay() === 0 ? 6 : date.getDay() - 1],
        present: attendance.find((a) => a.status === 'PRESENT')?._count || 0,
        absent: attendance.find((a) => a.status === 'ABSENT')?._count || 0,
      });
    }

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

    // Recent activities
    const activities: { icon: string; bg: string; title: string; detail: string; time: string }[] = [];
    // Get recent student admissions
    const recentStudents = await db.student.findMany({
      where: { schoolId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    recentStudents.forEach((student) => {
      activities.push({
        icon: '📋',
        bg: 'bg-indigo-50',
        title: 'New student admitted',
        detail: `${student.user?.firstName} ${student.user?.lastName}`,
        time: this.timeAgo(student.createdAt || new Date()),
      });
    });

    // Recent fee payments — from the live FeePayment workflow.
    const recentFeePayments = [...feePayments]
      .filter((p) => p.kind === 'PAID')
      .sort((a, b) => new Date(b.paidDate).getTime() - new Date(a.paidDate).getTime())
      .slice(0, 3);
    const recentSids = [...new Set(recentFeePayments.map((p) => p.studentId))];
    const recentStuds = recentSids.length
      ? await db.student.findMany({ where: { id: { in: recentSids } }, include: { user: true } })
      : [];
    const nameById = new Map(recentStuds.map((s) => [s.id, `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim()]));
    recentFeePayments.forEach((payment) => {
      activities.push({
        icon: '💰',
        bg: 'bg-emerald-50',
        title: 'Fee payment received',
        detail: `₹${N(payment.amount)} from ${nameById.get(payment.studentId) || 'student'}`,
        time: this.timeAgo(payment.paidDate || new Date()),
      });
    });

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
}

export default new DashboardService();
