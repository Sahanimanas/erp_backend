export type AdmissionStatusValue =
  | 'ENQUIRY'
  | 'CONTACTED'
  | 'REGISTERED'
  | 'ADMITTED'
  | 'REJECTED';

export interface CreateEnquiryRequest {
  studentName: string;
  gender?: string;
  dateOfBirth?: string | Date;
  classApplying?: string;
  parentName?: string;
  phone: string;
  email?: string;
  address?: string;
  source?: string;
  reference?: string;
  followUpDate?: string | Date;
  notes?: string;
  status?: AdmissionStatusValue;
}

export interface UpdateEnquiryRequest extends Partial<CreateEnquiryRequest> {
  status?: AdmissionStatusValue;
  registrationNo?: string;
}

export interface ListEnquiriesQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: AdmissionStatusValue | 'all';
  classApplying?: string;
  fromDate?: string;
  toDate?: string;
}
