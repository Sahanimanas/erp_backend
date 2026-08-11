export interface EmployeeExperienceInput {
  employer: string;
  role?: string;
  totalExperience?: string;
}

export interface CreateEmployeeRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  role?: string;
  employeeCode?: string;
  departmentId?: string;
  designationId?: string;
  reportingToId?: string;
  dateOfBirth?: Date | string;
  gender?: string;
  bloodGroup?: string;
  city?: string;
  address?: string;
  permanentAddress?: string;
  fatherName?: string;
  husbandName?: string;
  qualification?: string;
  rfidNumber?: string;
  aadharNumber?: string;
  panNumber?: string;
  dateOfJoining?: Date | string;
  bankAccount?: string;
  ifscCode?: string;
  baseSalary?: number;
  photo?: string;
  experiences?: EmployeeExperienceInput[];
}

/**
 * Every field the edit form can post. Blank strings are accepted and mean
 * "clear it" (nullable columns) or "leave unchanged" (required ones) — see
 * EmployeeService.updateEmployee.
 */
export interface UpdateEmployeeRequest {
  // User account fields
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  // Employee fields
  employeeCode?: string;
  departmentId?: string;
  designationId?: string;
  reportingToId?: string;
  dateOfBirth?: Date | string;
  dateOfJoining?: Date | string;
  gender?: string;
  bloodGroup?: string;
  city?: string;
  address?: string;
  permanentAddress?: string;
  fatherName?: string;
  husbandName?: string;
  qualification?: string;
  rfidNumber?: string;
  aadharNumber?: string;
  panNumber?: string;
  bankAccount?: string;
  ifscCode?: string;
  baseSalary?: number | string;
  photo?: string;
}

export interface CreateDepartmentRequest {
  name: string;
  headId?: string;
}

export interface CreateDesignationRequest {
  name: string;
  level?: number;
  description?: string;
  permissions?: string[];
}

export interface ApplyLeaveRequest {
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  reason: string;
}
