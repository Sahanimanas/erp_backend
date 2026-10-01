import { Request, Response } from 'express';
import employeeService from './service';
import { successResponse, errorResponse, failResponse, createdResponse, paginatedResponse, deletedResponse } from '@common/utils/response';
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
      failResponse(res, error, 'Failed to create employee');
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
      failResponse(res, error, 'Failed to update employee');
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
      failResponse(res, error, 'Failed to fetch employee');
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
      failResponse(res, error, 'Failed to list employees');
    }
  }

  /**
   * Permanent delete. Refuses to remove the requester's own employee record —
   * that would delete the login mid-request.
   */
  async deleteEmployee(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId } = req.params;

      if (!schoolId || !employeeId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const own = await employeeService.getEmployeeById(schoolId, employeeId).catch(() => null);
      if (own && req.user?.userId && own.userId === req.user.userId) {
        return void errorResponse(res, 400, 'You cannot delete your own employee record');
      }

      await employeeService.deleteEmployee(schoolId, employeeId);
      deletedResponse(res, 'Employee deleted permanently');
    } catch (error: any) {
      failResponse(res, error, 'Failed to delete employee');
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
      failResponse(res, error, 'Failed to deactivate employee');
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
      failResponse(res, error, 'Failed to activate employee');
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
      failResponse(res, error, 'Failed to create department');
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
      failResponse(res, error, 'Failed to list departments');
    }
  }

  /** One department + its employee roster (Department Details page). */
  async getDepartment(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const dept = await employeeService.getDepartment(schoolId, req.params.id);
      successResponse(res, 200, dept);
    } catch (error: any) {
      failResponse(res, error, 'Failed to load department');
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
      failResponse(res, error, 'Failed to create designation');
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
      failResponse(res, error, 'Failed to list designations');
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

  // ── Leave types ──────────────────────────────────────────────────────────
  async listLeaveTypes(req: Request, res: Response): Promise<void> {
    try {
      // ?enabled=true limits the list to types that can currently be applied for.
      const onlyEnabled = req.query.enabled === 'true';
      const types = await employeeService.listLeaveTypes(req.user!.schoolId, !onlyEnabled);
      successResponse(res, 200, types);
    } catch (e: any) { errorResponse(res, 400, e.message || 'Failed to list leave types'); }
  }

  // ── Leave assign ─────────────────────────────────────────────────────────
  async getLeaveAssignments(req: Request, res: Response): Promise<void> {
    try {
      const rows = await employeeService.getLeaveAssignments(req.user!.schoolId, req.params.employeeId);
      successResponse(res, 200, rows);
    } catch (e: any) { errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to load leave assignments'); }
  }

  async saveLeaveAssignments(req: Request, res: Response): Promise<void> {
    try {
      const items = req.body.assignments || req.body.items || req.body;
      const rows = await employeeService.saveLeaveAssignments(req.user!.schoolId, req.params.employeeId, items);
      successResponse(res, 200, rows, 'Leave assignment updated successfully');
    } catch (e: any) { errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to update leave assignments'); }
  }

  /** "Leave Assigned Details": entitlement vs days applied, per leave type. */
  async getLeaveSummary(req: Request, res: Response): Promise<void> {
    try {
      const rows = await employeeService.getLeaveSummary(req.user!.schoolId, req.params.employeeId);
      successResponse(res, 200, rows);
    } catch (e: any) { errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to load leave summary'); }
  }

  async cancelLeave(req: Request, res: Response): Promise<void> {
    try {
      const leave = await employeeService.cancelLeave(req.user!.schoolId, req.params.leaveId, req.body?.remarks);
      successResponse(res, 200, leave, 'Leave cancelled successfully');
    } catch (e: any) { errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to cancel leave'); }
  }

  // ── Self-service (Apply Leave) ───────────────────────────────────────────
  // "me" routes resolve the Employee row behind the logged-in user, so a
  // teacher/staff member can apply without being able to name another employee.

  async getMyEmployee(req: Request, res: Response): Promise<void> {
    try {
      const employee = await employeeService.getMyEmployee(req.user!.schoolId, req.user!.id);
      successResponse(res, 200, employee);
    } catch (e: any) { errorResponse(res, 404, e.message || 'No employee record linked to this login'); }
  }

  async getMyLeaves(req: Request, res: Response): Promise<void> {
    try {
      const employee = await employeeService.getMyEmployee(req.user!.schoolId, req.user!.id);
      const leaves = await employeeService.getEmployeeLeaves(req.user!.schoolId, employee.id);
      successResponse(res, 200, leaves);
    } catch (e: any) { errorResponse(res, 404, e.message || 'Failed to load your leaves'); }
  }

  async getMySalary(req: Request, res: Response): Promise<void> {
    try {
      const data = await employeeService.getMySalary(req.user!.schoolId, req.user!.id);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, 404, e.message || 'Failed to load your salary'); }
  }

  async getMyLeaveSummary(req: Request, res: Response): Promise<void> {
    try {
      const employee = await employeeService.getMyEmployee(req.user!.schoolId, req.user!.id);
      const rows = await employeeService.getLeaveSummary(req.user!.schoolId, employee.id);
      successResponse(res, 200, rows);
    } catch (e: any) { errorResponse(res, 404, e.message || 'Failed to load your leave summary'); }
  }

  async applyMyLeave(req: Request, res: Response): Promise<void> {
    try {
      const { leaveTypeId, startDate, endDate } = req.body;
      if (!leaveTypeId || !startDate || !endDate) {
        return void errorResponse(res, 400, 'Leave type and dates are required');
      }
      const employee = await employeeService.getMyEmployee(req.user!.schoolId, req.user!.id);
      const leave = await employeeService.applyLeave(req.user!.schoolId, employee.id, {
        ...req.body,
        reason: req.body.reason || 'Applied by employee',
      });
      createdResponse(res, leave, 'Leave applied successfully');
    } catch (e: any) { errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to apply leave'); }
  }

  async createLeaveType(req: Request, res: Response): Promise<void> {
    try {
      const type = await employeeService.createLeaveType(req.user!.schoolId, req.body);
      createdResponse(res, type, 'Leave type created successfully');
    } catch (e: any) { errorResponse(res, 400, e.message || 'Failed to create leave type'); }
  }

  async updateLeaveType(req: Request, res: Response): Promise<void> {
    try {
      const type = await employeeService.updateLeaveType(req.user!.schoolId, req.params.id, req.body);
      successResponse(res, 200, type, 'Leave type updated successfully');
    } catch (e: any) { errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to update leave type'); }
  }

  async deleteLeaveType(req: Request, res: Response): Promise<void> {
    try {
      await employeeService.deleteLeaveType(req.user!.schoolId, req.params.id);
      successResponse(res, 200, null, 'Leave type deleted');
    } catch (e: any) { errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to delete leave type'); }
  }

  /** School-wide leave register (admin approval queue). */
  async listLeaves(req: Request, res: Response): Promise<void> {
    try {
      const { status, employeeId, departmentId, startDate, endDate } = req.query as Record<string, string>;
      const leaves = await employeeService.listLeaves(req.user!.schoolId, { status, employeeId, departmentId, startDate, endDate });
      successResponse(res, 200, leaves);
    } catch (e: any) { errorResponse(res, 400, e.message || 'Failed to list leaves'); }
  }

  /** Per-leave-type entitlement / used / remaining for one employee. */
  async getLeaveBalance(req: Request, res: Response): Promise<void> {
    try {
      const balance = await employeeService.getLeaveBalance(req.user!.schoolId, req.params.employeeId);
      successResponse(res, 200, balance);
    } catch (e: any) { errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to load leave balance'); }
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
      failResponse(res, error, 'Failed to apply leave');
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
      failResponse(res, error, 'Failed to fetch leaves');
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
      failResponse(res, error, 'Failed to approve leave');
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
      failResponse(res, error, 'Failed to reject leave');
    }
  }
}

export default new EmployeeController();
