import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Generate proper bcrypt hash for password "test123" with salt 10
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('test123', salt);
  console.log('Generated password hash:', hashedPassword);

  // Define all roles
  const roles = [
    {
      name: 'SUPER_ADMIN' as UserRole,
      description: 'Platform administrator with full access',
    },
    {
      name: 'SCHOOL_ADMIN' as UserRole,
      description: 'School administrator',
    },
    {
      name: 'PRINCIPAL' as UserRole,
      description: 'School principal',
    },
    {
      name: 'TEACHER' as UserRole,
      description: 'Teacher',
    },
    {
      name: 'ACCOUNTANT' as UserRole,
      description: 'Accountant',
    },
    {
      name: 'STUDENT' as UserRole,
      description: 'Student',
    },
    {
      name: 'PARENT' as UserRole,
      description: 'Parent/Guardian',
    },
  ];

  // Define all permissions
  const permissions = [
    // School Management
    { name: 'CREATE_SCHOOL', description: 'Create new school', category: 'school' },
    { name: 'READ_SCHOOL', description: 'View school details', category: 'school' },
    { name: 'UPDATE_SCHOOL', description: 'Update school information', category: 'school' },
    { name: 'DELETE_SCHOOL', description: 'Delete school', category: 'school' },
    { name: 'MANAGE_SCHOOL_DOMAINS', description: 'Manage school domains', category: 'school' },

    // Student Management
    { name: 'CREATE_STUDENT', description: 'Create new student', category: 'student' },
    { name: 'READ_STUDENT', description: 'View student details', category: 'student' },
    { name: 'UPDATE_STUDENT', description: 'Update student information', category: 'student' },
    { name: 'DELETE_STUDENT', description: 'Delete student', category: 'student' },
    { name: 'BULK_IMPORT_STUDENTS', description: 'Import students in bulk', category: 'student' },
    { name: 'VIEW_STUDENT_DOCUMENTS', description: 'View student documents', category: 'student' },
    { name: 'UPLOAD_STUDENT_PHOTO', description: 'Upload student photo', category: 'student' },

    // Employee Management
    { name: 'CREATE_EMPLOYEE', description: 'Create new employee', category: 'employee' },
    { name: 'READ_EMPLOYEE', description: 'View employee details', category: 'employee' },
    { name: 'UPDATE_EMPLOYEE', description: 'Update employee information', category: 'employee' },
    { name: 'DELETE_EMPLOYEE', description: 'Delete employee', category: 'employee' },
    { name: 'MANAGE_EMPLOYEE_ATTENDANCE', description: 'Manage employee attendance', category: 'employee' },
    { name: 'MANAGE_LEAVES', description: 'Manage employee leaves', category: 'employee' },

    // Attendance
    { name: 'MARK_ATTENDANCE', description: 'Mark student attendance', category: 'attendance' },
    { name: 'VIEW_ATTENDANCE', description: 'View attendance records', category: 'attendance' },
    { name: 'ATTENDANCE_REPORTS', description: 'View attendance reports', category: 'attendance' },

    // Fees Management
    { name: 'CREATE_FEE_TYPE', description: 'Create fee type', category: 'fees' },
    { name: 'MANAGE_FEE_STRUCTURE', description: 'Manage fee structure', category: 'fees' },
    { name: 'COLLECT_FEES', description: 'Collect student fees', category: 'fees' },
    { name: 'VIEW_FEES', description: 'View fee records', category: 'fees' },
    { name: 'MANAGE_FINE', description: 'Manage fine rules', category: 'fees' },
    { name: 'GENERATE_RECEIPTS', description: 'Generate fee receipts', category: 'fees' },

    // Exams
    { name: 'CREATE_EXAM', description: 'Create exam', category: 'exam' },
    { name: 'MANAGE_EXAM_SUBJECTS', description: 'Manage exam subjects', category: 'exam' },
    { name: 'ENTER_MARKS', description: 'Enter student marks', category: 'exam' },
    { name: 'VIEW_RESULTS', description: 'View exam results', category: 'exam' },
    { name: 'GENERATE_REPORT_CARDS', description: 'Generate report cards', category: 'exam' },

    // Classes & Sections
    { name: 'MANAGE_CLASSES', description: 'Create and manage classes', category: 'academic' },
    { name: 'MANAGE_SECTIONS', description: 'Create and manage sections', category: 'academic' },
    { name: 'MANAGE_SUBJECTS', description: 'Manage subjects', category: 'academic' },
    { name: 'ASSIGN_CLASS_TEACHER', description: 'Assign class teachers', category: 'academic' },

    // Timetable
    { name: 'CREATE_TIMETABLE', description: 'Create timetable', category: 'timetable' },
    { name: 'VIEW_TIMETABLE', description: 'View timetable', category: 'timetable' },

    // Payroll
    { name: 'MANAGE_SALARY_STRUCTURE', description: 'Manage salary structure', category: 'payroll' },
    { name: 'PROCESS_PAYROLL', description: 'Process payroll', category: 'payroll' },
    { name: 'GENERATE_PAYSLIPS', description: 'Generate payslips', category: 'payroll' },

    // Reports
    { name: 'VIEW_STUDENT_REPORTS', description: 'View student reports', category: 'reports' },
    { name: 'VIEW_FINANCIAL_REPORTS', description: 'View financial reports', category: 'reports' },
    { name: 'VIEW_ATTENDANCE_REPORTS', description: 'View attendance reports', category: 'reports' },

    // System Settings
    { name: 'MANAGE_ROLES', description: 'Manage roles and permissions', category: 'settings' },
    { name: 'MANAGE_SETTINGS', description: 'Manage system settings', category: 'settings' },
    { name: 'VIEW_AUDIT_LOGS', description: 'View audit logs', category: 'settings' },

    // Subscriptions
    { name: 'CREATE_SUBSCRIPTION_PLAN', description: 'Create subscription plan', category: 'subscription' },
    { name: 'MANAGE_SUBSCRIPTIONS', description: 'Manage school subscriptions', category: 'subscription' },
  ];

  try {
    // Create roles
    console.log('Creating roles...');
    for (const role of roles) {
      await prisma.role.upsert({
        where: { name: role.name },
        update: {},
        create: {
          name: role.name,
          description: role.description,
        },
      });
    }
    console.log('✓ Roles created');

    // Create permissions
    console.log('Creating permissions...');
    for (const permission of permissions) {
      await prisma.permission.upsert({
        where: { name: permission.name },
        update: {},
        create: {
          name: permission.name,
          description: permission.description,
          category: permission.category,
        },
      });
    }
    console.log('✓ Permissions created');

    // Create test school
    console.log('Creating test school...');
    const school = await prisma.school.upsert({
      where: { email: 'admin@school.com' },
      update: {},
      create: {
        name: 'Demo School',
        slug: 'demo-school',
        email: 'admin@school.com',
        phone: '9876543210',
        address: '123 Education Street',
        city: 'New York',
        state: 'NY',
        pincode: '10001',
        country: 'USA',
        principalName: 'John Doe',
        principalEmail: 'principal@school.com',
        isActive: true,
      },
    });
    console.log('✓ School created');

    // Create subscription plan
    console.log('Creating subscription plan...');
    const plan = await prisma.subscriptionPlan.upsert({
      where: { name: 'Basic' },
      update: {},
      create: {
        name: 'Basic',
        description: 'Basic subscription plan',
        price: 99.99,
        maxUsers: 100,
        maxStudents: 1000,
        storageLimit: BigInt(10737418240), // 10GB
      },
    });
    console.log('✓ Plan created');

    // Create subscription
    console.log('Creating subscription...');
    await prisma.subscription.upsert({
      where: { schoolId: school.id },
      update: {},
      create: {
        schoolId: school.id,
        planId: plan.id,
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      },
    });
    console.log('✓ Subscription created');

    // Create academic year
    console.log('Creating academic year...');
    const academicYear = await prisma.academicYear.upsert({
      where: { schoolId_name: { schoolId: school.id, name: '2024-2025' } },
      update: {},
      create: {
        schoolId: school.id,
        name: '2024-2025',
        startDate: new Date('2024-04-01'),
        endDate: new Date('2025-03-31'),
        isActive: true,
      },
    });
    console.log('✓ Academic year created');

    // Create classes
    console.log('Creating classes...');
    const classNames = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    const classes = [];
    for (const name of classNames) {
      const cls = await prisma.class.upsert({
        where: { schoolId_name: { schoolId: school.id, name } },
        update: {},
        create: {
          schoolId: school.id,
          name,
          academicYearId: academicYear.id,
        },
      });
      classes.push(cls);
    }
    console.log('✓ Classes created');

    // Create sections
    console.log('Creating sections...');
    const sectionNames = ['A', 'B', 'C', 'D'];
    for (const cls of classes) {
      for (const sectionName of sectionNames) {
        await prisma.section.upsert({
          where: { classId_name: { classId: cls.id, name: sectionName } },
          update: {},
          create: {
            schoolId: school.id,
            classId: cls.id,
            name: sectionName,
          },
        });
      }
    }
    console.log('✓ Sections created');

    // Create test admin user
    console.log('Creating test admin user...');
    await prisma.user.upsert({
      where: { email_schoolId: { email: 'admin@school.com', schoolId: school.id } },
      update: { password: hashedPassword },
      create: {
        schoolId: school.id,
        email: 'admin@school.com',
        firstName: 'Admin',
        lastName: 'User',
        password: hashedPassword,
        role: 'SCHOOL_ADMIN',
        isActive: true,
        emailVerified: true,
      },
    });
    console.log('✓ Admin user created');
    console.log('✓ Login credentials: admin@school.com / test123');

    // ── Fee Group + Fee Types (schema: FeeType requires groupId, amount is BigInt) ──
    console.log('Creating fee group & types...');
    const feeGroup = await prisma.feeGroup.upsert({
      where: { schoolId_name: { schoolId: school.id, name: 'Term 1 Fees' } },
      update: {},
      create: {
        schoolId: school.id,
        name: 'Term 1 Fees',
        description: 'First term consolidated fees',
      },
    });

    const feeTypeData = [
      { name: 'Tuition Fee', amount: BigInt(5000) },
      { name: 'Transport Fee', amount: BigInt(1000) },
      { name: 'Exam Fee', amount: BigInt(500) },
    ];
    for (const ft of feeTypeData) {
      await prisma.feeType.upsert({
        where: { schoolId_name: { schoolId: school.id, name: ft.name } },
        update: {},
        create: {
          schoolId: school.id,
          groupId: feeGroup.id,
          name: ft.name,
          amount: ft.amount,
        },
      });
    }
    const FEE_TOTAL = BigInt(6500); // sum of the three fee types
    console.log('✓ Fee group & types created');

    // ── Departments & Designations ──
    console.log('Creating departments & designations...');
    const department = await prisma.department.upsert({
      where: { schoolId_name: { schoolId: school.id, name: 'Academics' } },
      update: {},
      create: { schoolId: school.id, name: 'Academics' },
    });
    const designation = await prisma.designation.upsert({
      where: { schoolId_name: { schoolId: school.id, name: 'Senior Teacher' } },
      update: {},
      create: { schoolId: school.id, name: 'Senior Teacher', level: 2 },
    });
    console.log('✓ Departments & designations created');

    // ── Sections & per-section Fee instances ──
    const allSections = await prisma.section.findMany({
      where: { schoolId: school.id },
      include: { class: true },
    });

    const sectionFeeId = new Map<string, string>();
    for (const section of allSections) {
      let fee = await prisma.fee.findFirst({
        where: { schoolId: school.id, sectionId: section.id, groupId: feeGroup.id },
      });
      if (!fee) {
        fee = await prisma.fee.create({
          data: {
            schoolId: school.id,
            sectionId: section.id,
            groupId: feeGroup.id,
            dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
            fine: BigInt(50),
          },
        });
      }
      sectionFeeId.set(section.id, fee.id);
    }

    // ── Sample students (3 per section) with fee collection, parent, attendance ──
    console.log('Creating sample students...');
    const firstNames = ['Jaysal', 'Ragani', 'Anmol', 'Aryan', 'Sherya', 'Krity', 'Anish', 'Priya', 'Rahul', 'Sneha', 'Vikas', 'Neha'];
    const lastNames = ['Kumari', 'Sharma', 'Kumar', 'Singh', 'Verma', 'Gupta', 'Patel', 'Nair', 'Desai', 'Chopra'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let studentCounter = 0;
    for (const section of allSections) {
      for (let i = 0; i < 3; i++) {
        const first = firstNames[(studentCounter + i) % firstNames.length];
        const last = lastNames[(studentCounter + i * 3) % lastNames.length];
        const studentEmail = `${first.toLowerCase()}.${last.toLowerCase()}${studentCounter}@student.com`;
        const roll = `${section.class?.name}${section.name}${String(i + 1).padStart(2, '0')}`;

        const studentUser = await prisma.user.upsert({
          where: { email_schoolId: { email: studentEmail, schoolId: school.id } },
          update: {},
          create: {
            schoolId: school.id,
            firstName: first,
            lastName: last,
            email: studentEmail,
            phone: `98${String(7000000 + studentCounter).padStart(8, '0')}`,
            password: hashedPassword,
            role: 'STUDENT',
            isActive: true,
            emailVerified: true,
          },
        });

        const student = await prisma.student.upsert({
          where: { userId: studentUser.id },
          update: {},
          create: {
            schoolId: school.id,
            userId: studentUser.id,
            sectionId: section.id,
            rollNumber: roll,
            admissionNumber: `ADM${String(studentCounter + 1).padStart(4, '0')}`,
            dateOfBirth: new Date(2008 + (studentCounter % 6), (studentCounter % 12), ((studentCounter % 27) + 1)),
            gender: studentCounter % 2 === 0 ? 'MALE' : 'FEMALE',
            bloodGroup: ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'][studentCounter % 8],
          },
        });

        // Fee collection (status enum: COMPLETED / PENDING — NOT 'PAID')
        const feeId = sectionFeeId.get(section.id)!;
        const existingFC = await prisma.feeCollection.findFirst({
          where: { studentId: student.id, feeId },
        });
        if (!existingFC) {
          const isPaid = studentCounter % 3 !== 0; // ~2/3 paid
          await prisma.feeCollection.create({
            data: {
              schoolId: school.id,
              studentId: student.id,
              feeId,
              amount: FEE_TOTAL,
              paidDate: new Date(),
              status: isPaid ? 'COMPLETED' : 'PENDING',
              receiptNo: isPaid ? `RCP-${student.id.slice(-8)}` : null,
            },
          });
        }

        // Parent for the first 2 students of each section
        if (i < 2) {
          const parentEmail = `parent.${roll.toLowerCase()}@parent.com`;
          const parentUser = await prisma.user.upsert({
            where: { email_schoolId: { email: parentEmail, schoolId: school.id } },
            update: {},
            create: {
              schoolId: school.id,
              firstName: `${first}'s`,
              lastName: 'Parent',
              email: parentEmail,
              phone: `97${String(6000000 + studentCounter).padStart(8, '0')}`,
              password: hashedPassword,
              role: 'PARENT',
              isActive: true,
              emailVerified: true,
            },
          });
          await prisma.parent.upsert({
            where: { userId: parentUser.id },
            update: {},
            create: {
              schoolId: school.id,
              userId: parentUser.id,
              relationship: studentCounter % 2 === 0 ? 'Father' : 'Mother',
              occupation: 'Business',
              students: { connect: { id: student.id } },
            },
          });
        }

        // Today's attendance (unique on schoolId+studentId+date)
        const existingAtt = await prisma.studentAttendance.findFirst({
          where: { studentId: student.id, date: today },
        });
        if (!existingAtt) {
          await prisma.studentAttendance.create({
            data: {
              schoolId: school.id,
              studentId: student.id,
              date: today,
              status: studentCounter % 5 === 0 ? 'ABSENT' : 'PRESENT',
            },
          });
        }

        studentCounter++;
      }
    }
    console.log(`✓ ${studentCounter} students created with fees, parents & attendance`);

    // ── Employees (3 teachers) ──
    console.log('Creating employees...');
    const employeeData = [
      { first: 'Ramesh', last: 'Iyer' },
      { first: 'Sunita', last: 'Rao' },
      { first: 'Vijay', last: 'Menon' },
    ];
    for (let i = 0; i < employeeData.length; i++) {
      const { first, last } = employeeData[i];
      const empEmail = `${first.toLowerCase()}.${last.toLowerCase()}@staff.com`;
      const empUser = await prisma.user.upsert({
        where: { email_schoolId: { email: empEmail, schoolId: school.id } },
        update: {},
        create: {
          schoolId: school.id,
          firstName: first,
          lastName: last,
          email: empEmail,
          phone: `96${String(5000000 + i).padStart(8, '0')}`,
          password: hashedPassword,
          role: 'TEACHER',
          isActive: true,
          emailVerified: true,
        },
      });
      await prisma.employee.upsert({
        where: { userId: empUser.id },
        update: {},
        create: {
          schoolId: school.id,
          userId: empUser.id,
          employeeCode: `EMP${String(i + 1).padStart(3, '0')}`,
          departmentId: department.id,
          designationId: designation.id,
          dateOfBirth: new Date(1985 + i, i, 15),
          gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
          baseSalary: BigInt(40000 + i * 5000),
        },
      });
    }
    console.log('✓ Employees created');

    // ── Office Accounting: accounts, voucher heads, transactions ──
    console.log('Creating accounting data...');
    const cashAcct = await prisma.account.upsert({
      where: { schoolId_name: { schoolId: school.id, name: 'Cash in Hand' } },
      update: {},
      create: { schoolId: school.id, name: 'Cash in Hand', type: 'CASH', openingBalance: BigInt(50000) },
    });
    const bankAcct = await prisma.account.upsert({
      where: { schoolId_name: { schoolId: school.id, name: 'School Bank A/C' } },
      update: {},
      create: { schoolId: school.id, name: 'School Bank A/C', type: 'BANK', accountNumber: '1234567890', bankName: 'State Bank', openingBalance: BigInt(200000) },
    });

    const voucherHeads = [
      { name: 'Tuition Income', type: 'INCOME' as const },
      { name: 'Donation', type: 'INCOME' as const },
      { name: 'Salaries', type: 'EXPENSE' as const },
      { name: 'Utilities', type: 'EXPENSE' as const },
      { name: 'Maintenance', type: 'EXPENSE' as const },
    ];
    const vhMap: Record<string, string> = {};
    for (const vh of voucherHeads) {
      const created = await prisma.voucherHead.upsert({
        where: { schoolId_name: { schoolId: school.id, name: vh.name } },
        update: {},
        create: { schoolId: school.id, name: vh.name, type: vh.type },
      });
      vhMap[vh.name] = created.id;
    }

    const txnCount = await prisma.transaction.count({ where: { schoolId: school.id } });
    if (txnCount === 0) {
      const sampleTxns = [
        { accountId: bankAcct.id, voucherHeadId: vhMap['Tuition Income'], type: 'INCOME' as const, amount: BigInt(120000), description: 'Term 1 tuition' },
        { accountId: cashAcct.id, voucherHeadId: vhMap['Donation'], type: 'INCOME' as const, amount: BigInt(25000), description: 'Alumni donation' },
        { accountId: bankAcct.id, voucherHeadId: vhMap['Salaries'], type: 'EXPENSE' as const, amount: BigInt(85000), description: 'Staff salaries' },
        { accountId: cashAcct.id, voucherHeadId: vhMap['Utilities'], type: 'EXPENSE' as const, amount: BigInt(12000), description: 'Electricity bill' },
        { accountId: cashAcct.id, voucherHeadId: vhMap['Maintenance'], type: 'EXPENSE' as const, amount: BigInt(8000), description: 'Classroom repairs' },
      ];
      for (let i = 0; i < sampleTxns.length; i++) {
        const t = sampleTxns[i];
        await prisma.transaction.create({
          data: { schoolId: school.id, ...t, date: new Date(2026, 5, (i + 1) * 3) },
        });
      }
    }
    console.log('✓ Accounting data created');

    console.log('✓ Seeding completed successfully');
  } catch (error) {
    console.error('Seeding error:', error);
    throw error;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
