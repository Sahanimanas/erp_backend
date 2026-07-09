import { Request, Response } from 'express';
import employeeService from './service';
import { successResponse, errorResponse, createdResponse, paginatedResponse, deletedResponse } from '@common/utils/response';
import { DESIGNATION_MODULES } from '@common/constants/designationModules';

export class EmployeeController {
  async createEmployee(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { firstName, lastName, email, password } = req.body;

      if (!schoolId || !firstName || !lastName || !email || !password) {
        return void errorResponse(res, 400, 'Name, email and password are required');
      }

      const employee = await employeeService.createEmployee(schoolId, req.body);
      createdResponse(res, employee, 'Employee created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create employee');
    }
  }

  async updateEmployee(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId } = req.params;

      if (!schoolId || !employeeId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const employee = await employeeService.updateEmployee(schoolId, employeeId, req.body);
      successResponse(res, 200, employee, 'Employee updated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to update employee');
    }
  }

  async getEmployeeById(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId } = req.params;

      if (!schoolId || !employeeId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const employee = await employeeService.getEmployeeById(schoolId, employeeId);
      successResponse(res, 200, employee);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch employee');
    }
  }

  async listEmployees(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const departmentId = req.query.departmentId as string | undefined;
      const search = req.query.search as string | undefined;
      const role = req.query.role as string | undefined;
      const status = req.query.status as string | undefined;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const result = await employeeService.listEmployees(schoolId, page, limit, departmentId, search, role, status);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list employees');
    }
  }

  async deactivateEmployee(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId } = req.params;

      if (!schoolId || !employeeId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await employeeService.deactivateEmployee(schoolId, employeeId);
      successResponse(res, 200, null, 'Employee deactivated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to deactivate employee');
    }
  }

  async activateEmployee(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId } = req.params;

      if (!schoolId || !employeeId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await employeeService.activateEmployee(schoolId, employeeId);
      successResponse(res, 200, null, 'Employee activated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to activate employee');
    }
  }

  /** The canonical privilege modules a designation can be granted (backend-owned). */
  async listDesignationModules(_req: Request, res: Response): Promise<void> {
    successResponse(res, 200, DESIGNATION_MODULES);
  }

  async createDepartment(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { name } = req.body;

      if (!schoolId || !name) {
        return void errorResponse(res, 400, 'Name is required');
      }

      const dept = await employeeService.createDepartment(schoolId, req.body);
      createdResponse(res, dept, 'Department created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create department');
    }
  }

  async listDepartments(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const departments = await employeeService.listDepartments(schoolId);
      successResponse(res, 200, departments);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list departments');
    }
  }

  async createDesignation(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { name } = req.body;

      if (!schoolId || !name) {
        return void errorResponse(res, 400, 'Designation name is required');
      }

      const designation = await employeeService.createDesignation(schoolId, req.body);
      createdResponse(res, designation, 'Designation created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create designation');
    }
  }

  async listDesignations(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const designations = await employeeService.listDesignations(schoolId);
      successResponse(res, 200, designations);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list designations');
    }
  }

  async updateDesignation(req: Request, res: Response): Promise<void> {
    try {
      const d = await employeeService.updateDesignation(req.user!.schoolId, req.params.id, req.body);
      successResponse(res, 200, d, 'Designation updated');
    } catch (e: any) { errorResponse(res, e.message.includes('not found') ? 404 : 400, e.message); }
  }
  async deleteDesignation(req: Request, res: Response): Promise<void> {
    try { await employeeService.deleteDesignation(req.user!.schoolId, req.params.id); successResponse(res, 200, null, 'Designation deleted'); }
    catch (e: any) { errorResponse(res, e.message.includes('not found') ? 404 : 400, e.message); }
  }
  async updateDepartment(req: Request, res: Response): Promise<void> {
    try {
      const d = await employeeService.updateDepartment(req.user!.schoolId, req.params.id, req.body);
      successResponse(res, 200, d, 'Department updated');
    } catch (e: any) { errorResponse(res, e.message.includes('not found') ? 404 : 400, e.message); }
  }
  async deleteDepartment(req: Request, res: Response): Promise<void> {
    try { await employeeService.deleteDepartment(req.user!.schoolId, req.params.id); successResponse(res, 200, null, 'Department deleted'); }
    catch (e: any) { errorResponse(res, e.message.includes('not found') ? 404 : 400, e.message); }
  }
  async importEmployees(req: Request, res: Response): Promise<void> {
    try {
      const result = await employeeService.importEmployees(req.user!.schoolId, req.body.employees || req.body.rows || req.body);
      successResponse(res, 200, result, `Imported ${result.imported} employee(s)`);
    } catch (e: any) { errorResponse(res, 400, e.message || 'Failed to import employees'); }
  }

  async applyLeave(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId } = req.params;
      const { leaveTypeId, startDate, endDate, reason } = req.body;

      if (!schoolId || !employeeId || !leaveTypeId || !startDate || !endDate || !reason) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const leave = await employeeService.applyLeave(schoolId, employeeId, req.body);
      createdResponse(res, leave, 'Leave applied successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to apply leave');
    }
  }

  async getEmployeeLeaves(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId } = req.params;

      if (!schoolId || !employeeId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const leaves = await employeeService.getEmployeeLeaves(schoolId, employeeId);
      successResponse(res, 200, leaves);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch leaves');
    }
  }

  async approveLeave(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { leaveId } = req.params;
      const approvedBy = req.user?.id;

      if (!schoolId || !leaveId || !approvedBy) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const leave = await employeeService.approveLeave(schoolId, leaveId, approvedBy);
      successResponse(res, 200, leave, 'Leave approved successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to approve leave');
    }
  }

  async rejectLeave(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { leaveId } = req.params;
      const { remarks } = req.body;

      if (!schoolId || !leaveId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const leave = await employeeService.rejectLeave(schoolId, leaveId, remarks);
      successResponse(res, 200, leave, 'Leave rejected successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to reject leave');
    }
  }
}

export default new EmployeeController();
