export interface CreatePeriodRequest {
  name: string;
  startTime: string;
  endTime: string;
}

export interface UpdatePeriodRequest {
  name?: string;
  startTime?: string;
  endTime?: string;
}

export interface CreateTimetableSlotRequest {
  sectionId: string;
  periodId: string;
  subjectId: string;
  day: string;
}

export interface UpdateTimetableSlotRequest {
  periodId?: string;
  subjectId?: string;
  day?: string;
}
