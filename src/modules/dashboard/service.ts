import { db } from '@common/database/client';

export class DashboardService {
  async getStats(schoolId: string) {
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

    // Fee collection stats for current month
    const currentDate = new Date();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const monthlyFeeCollections = await db.feeCollection.findMany({
      where: {
        schoolId,
        createdAt: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
      },
    });

    const totalFees = monthlyFeeCollections.reduce((sum, fc) => sum + Number(fc.amount), 0);
    const collectedFees = monthlyFeeCollections
      .filter((fc) => fc.status === 'COMPLETED')
      .reduce((sum, fc) => sum + Number(fc.amount), 0);

    const feePercentage = totalFees > 0 ? Math.round((collectedFees / totalFees) * 100) : 0;

    // Pending fees
    const pendingFees = await db.feeCollection.findMany({
      where: {
        schoolId,
        status: 'PENDING',
      },
    });

    const pendingAmount = pendingFees.reduce((sum, fc) => sum + Number(fc.amount), 0);

    // Today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAttendance = await db.studentAttendance.groupBy({
      by: ['status'],
      where: {
        schoolId,
        date: {
          gte: today,
          lt: tomorrow,
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

      const fees = await db.feeCollection.findMany({
        where: {
          schoolId,
          createdAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      });

      const monthTotal = fees.reduce((sum, fc) => sum + Number(fc.amount), 0);
      const monthCollected = fees
        .filter((fc) => fc.status === 'COMPLETED')
        .reduce((sum, fc) => sum + Number(fc.amount), 0);

      monthlyFees.push({
        month: monthStart.toLocaleString('en-US', { month: 'short' }),
        total: monthTotal,
        collected: monthCollected,
        remaining: monthTotal - monthCollected,
      });
    }

    // Recent activities
    const activities = [];
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

    // Get recent fee payments
    const recentPayments = await db.feeCollection.findMany({
      where: { schoolId, status: 'COMPLETED' },
      include: { student: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    recentPayments.forEach((payment) => {
      activities.push({
        icon: '💰',
        bg: 'bg-emerald-50',
        title: 'Fee payment received',
        detail: `₹${Number(payment.amount)} from ${payment.student?.user?.firstName}`,
        time: this.timeAgo(payment.createdAt || new Date()),
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
        income: Math.round(collectedFees),
        expense: 0, // Would be calculated from actual expense data
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
