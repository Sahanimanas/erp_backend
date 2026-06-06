export interface MarkStudentAttendanceRequest {
  studentId: string;
  date: Date;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'LATE' | 'HALF_DAY';
  remarks?: string;
}

export interface MarkEmployeeAttendanceRequest {
  employeeId: string;
  date: Date;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'LATE' | 'HALF_DAY';
  remarks?: string;
}

export interface AttendanceReportRequest {
  startDate: Date;
  endDate: Date;
  status?: string;
}

export interface BulkAttendanceRequest {
  csvData: string;
  type: 'STUDENT' | 'EMPLOYEE';
}
