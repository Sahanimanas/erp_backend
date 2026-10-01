/**
 * Seeds a demo tenant with ONE student + real attendance & fee dues so the mobile
 * Student app can be tested end-to-end. Idempotent — safe to re-run.
 *
 *   Login:  demo.student@school.com  /  student123   (role STUDENT)
 *
 * Run: node scripts/seed-demo-student.js   (from backend/)
 */
const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma/client'));
const bcrypt = require(path.join(__dirname, '..', 'node_modules', 'bcrypt'));

const db = new PrismaClient();

async function main() {
  // 1. School (active tenant)
  const school = await db.school.upsert({
    where: { slug: 'demo-public-school' },
    update: { isActive: true },
    create: {
      name: 'Demo Public School',
      slug: 'demo-public-school',
      email: 'demo@school.com',
      phone: '9000000000',
      city: 'Indore', state: 'MP', country: 'India',
      isActive: true,
    },
  });

  // 2. Academic year
  let year = await db.academicYear.findFirst({ where: { schoolId: school.id, name: '2026-27' } });
  if (!year) {
    year = await db.academicYear.create({
      data: { schoolId: school.id, name: '2026-27', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), isActive: true },
    });
  }

  // 3. Class + Section
  let klass = await db.class.findFirst({ where: { schoolId: school.id, academicYearId: year.id, name: 'Class 5' } });
  if (!klass) klass = await db.class.create({ data: { schoolId: school.id, academicYearId: year.id, name: 'Class 5' } });

  let section = await db.section.findFirst({ where: { schoolId: school.id, classId: klass.id, name: 'A' } });
  if (!section) section = await db.section.create({ data: { schoolId: school.id, classId: klass.id, name: 'A', strength: 1 } });

  // 4. Student user + student record
  const password = await bcrypt.hash('student123', 10);
  let user = await db.user.findFirst({ where: { email: 'demo.student@school.com', schoolId: school.id } });
  if (!user) {
    user = await db.user.create({
      data: {
        schoolId: school.id, firstName: 'Aarav', lastName: 'Sharma',
        email: 'demo.student@school.com', phone: '9000000001',
        password, role: 'STUDENT', isActive: true, emailVerified: true,
      },
    });
  } else {
    user = await db.user.update({ where: { id: user.id }, data: { password, isActive: true, role: 'STUDENT' } });
  }

  const studentPhoto = 'https://i.pravatar.cc/240?img=13';
  let student = await db.student.findUnique({ where: { userId: user.id } });
  if (!student) {
    student = await db.student.create({
      data: {
        schoolId: school.id, userId: user.id, sectionId: section.id,
        rollNumber: '5A-01', admissionNumber: 'ADM-DEMO-001',
        dateOfBirth: new Date('2015-06-12'), gender: 'Male', bloodGroup: 'O+',
        fatherName: 'Rakesh Sharma', motherName: 'Sunita Sharma',
        address: 'Vijay Nagar, Indore', city: 'Indore', pincode: '452010',
        session: '2026-27', photo: studentPhoto,
      },
    });
  } else {
    student = await db.student.update({ where: { id: student.id }, data: { sectionId: section.id, isActive: true, photo: studentPhoto } });
  }

  // 5. Attendance — last 30 weekdays, mostly present
  await db.studentAttendance.deleteMany({ where: { studentId: student.id } });
  const statuses = [];
  const today = new Date();
  let made = 0;
  for (let i = 1; made < 24 && i <= 40; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0) continue; // skip Sundays
    // pattern: mostly present, a few absent/late
    let status = 'PRESENT';
    if (made % 9 === 4) status = 'ABSENT';
    else if (made % 7 === 3) status = 'LATE';
    statuses.push({ schoolId: school.id, studentId: student.id, date: d, status });
    made++;
  }
  await db.studentAttendance.createMany({ data: statuses });

  // 6. Fees — a group + a fee + two pending collections
  let group = await db.feeGroup.findFirst({ where: { schoolId: school.id, name: 'Tuition Fee' } });
  if (!group) group = await db.feeGroup.create({ data: { schoolId: school.id, name: 'Tuition Fee', description: 'Term tuition' } });

  let fee = await db.fee.findFirst({ where: { schoolId: school.id, sectionId: section.id, groupId: group.id } });
  if (!fee) fee = await db.fee.create({ data: { schoolId: school.id, sectionId: section.id, groupId: group.id, dueDate: new Date('2026-09-10'), fine: BigInt(0) } });

  let fee2 = await db.fee.findFirst({ where: { schoolId: school.id, sectionId: section.id, groupId: group.id, dueDate: new Date('2026-12-10') } });
  if (!fee2) fee2 = await db.fee.create({ data: { schoolId: school.id, sectionId: section.id, groupId: group.id, dueDate: new Date('2026-12-10'), fine: BigInt(0) } });

  await db.feeCollection.deleteMany({ where: { studentId: student.id } });
  await db.feeCollection.createMany({
    data: [
      { schoolId: school.id, studentId: student.id, feeId: fee.id, amount: BigInt(12500), paidDate: new Date(), status: 'PENDING' },
      { schoolId: school.id, studentId: student.id, feeId: fee2.id, amount: BigInt(8000), paidDate: new Date(), status: 'PENDING' },
    ],
  });

  // 7. Paid receipts (FeePayment) — powers the Receipts / Fee History screen
  await db.feePayment.deleteMany({ where: { studentId: student.id } });
  await db.feePayment.createMany({
    data: [
      { schoolId: school.id, studentId: student.id, feeTypeName: 'Tuition Fee', month: 'Apr-2026', amount: BigInt(12500), paidDate: new Date('2026-04-08'), receiptNo: 'RCP-2026-0412', mode: 'ONLINE', kind: 'PAID' },
      { schoolId: school.id, studentId: student.id, feeTypeName: 'Tuition Fee', month: 'May-2026', amount: BigInt(12500), paidDate: new Date('2026-05-06'), receiptNo: 'RCP-2026-0533', mode: 'CASH', kind: 'PAID' },
      { schoolId: school.id, studentId: student.id, feeTypeName: 'Transport Fee', month: 'May-2026', amount: BigInt(2000), paidDate: new Date('2026-05-06'), receiptNo: 'RCP-2026-0534', mode: 'CASH', kind: 'PAID' },
      { schoolId: school.id, studentId: student.id, feeTypeName: 'Tuition Fee', month: 'Jun-2026', amount: BigInt(12500), paidDate: new Date('2026-06-09'), receiptNo: 'RCP-2026-0641', mode: 'ONLINE', kind: 'PAID' },
    ],
  });

  // 7b. Canonical fee-management setup: fee TYPES + per-class STRUCTURE.
  //     This powers the app's Fee module (Overview / Collect / Ledger / Structure)
  //     which reads the payments + fee-management endpoints (computeLedger).
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const acadMonths = [];
  for (let i = 3; i <= 14; i++) acadMonths.push(`${MONTHS[i % 12]}-${i < 12 ? 2026 : 2027}`);
  const feeTypeDefs = [
    { name: 'Tuition Fee', frequency: 'Monthly', months: acadMonths, amount: 2000 },
    { name: 'Exam Fee', frequency: 'One Time', months: [], amount: 800 },
    { name: 'Admission Fee', frequency: 'One Time', months: [], amount: 1500 },
  ];
  for (const def of feeTypeDefs) {
    let ft = await db.classFeeType.findFirst({ where: { schoolId: school.id, name: def.name, deletedAt: null } });
    if (!ft) {
      ft = await db.classFeeType.create({
        data: { schoolId: school.id, name: def.name, frequency: def.frequency, months: def.months, isTransport: false, enabled: true },
      });
    }
    const existing = await db.classFeeStructure.findFirst({ where: { classId: klass.id, feeTypeId: ft.id, academicYearId: null } });
    if (existing) {
      await db.classFeeStructure.update({ where: { id: existing.id }, data: { amount: BigInt(def.amount), enabled: true } });
    } else {
      await db.classFeeStructure.create({
        data: { schoolId: school.id, classId: klass.id, feeTypeId: ft.id, academicYearId: null, amount: BigInt(def.amount), enabled: true },
      });
    }
  }

  // 8. Subjects + weekly timetable for the section (powers the Timetable screen)
  const subjectDefs = [['Maths', 'MATH'], ['Science', 'SCI'], ['English', 'ENG'], ['Hindi', 'HIN'], ['Social Studies', 'SST'], ['Computer', 'CS']];
  const subjects = [];
  for (const [name, code] of subjectDefs) {
    let s = await db.subject.findFirst({ where: { schoolId: school.id, code } });
    if (!s) s = await db.subject.create({ data: { schoolId: school.id, name, code } });
    subjects.push(s);
  }

  // Map the subjects to the class (ClassSubject). This powers Result Management:
  // marks entry, computed results, rankings and report cards all read the
  // class→subject mapping to build their subject columns.
  for (const s of subjects) {
    const existing = await db.classSubject.findFirst({ where: { classId: klass.id, subjectId: s.id } });
    if (!existing) await db.classSubject.create({ data: { classId: klass.id, subjectId: s.id } });
  }

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const TIMES = [['08:00', '08:45'], ['08:45', '09:30'], ['09:30', '10:15'], ['10:30', '11:15'], ['11:15', '12:00'], ['12:00', '12:45']];
  const periodLabels = TIMES.map((_, i) => `Period ${i + 1}`);

  await db.classTimetable.deleteMany({ where: { schoolId: school.id, sectionId: section.id, session: 'DEFAULT' } });
  const tt = await db.classTimetable.create({
    data: {
      schoolId: school.id, sectionId: section.id, session: 'DEFAULT',
      academicYearId: year.id, maxPeriods: TIMES.length, completed: true, periodLabels,
    },
  });
  const cells = [];
  DAYS.forEach((day, di) => {
    TIMES.forEach(([startTime, endTime], pi) => {
      const subj = subjects[(di + pi) % subjects.length];
      cells.push({ schoolId: school.id, timetableId: tt.id, day, periodIndex: pi, startTime, endTime, subjectId: subj.id });
    });
  });
  await db.classTimetableCell.createMany({ data: cells });

  // 9. Exams + marks (powers Report Card / Results)
  await db.studentMark.deleteMany({ where: { studentId: student.id } });
  const examDefs = [
    { name: 'Unit Test 1', type: 'UNIT_TEST', start: '2026-05-12', end: '2026-05-16', marks: [78, 85, 92, 70, 88, 95] },
    { name: 'Half Yearly Exam', type: 'HALF_YEARLY', start: '2026-09-20', end: '2026-09-28', marks: [82, 79, 90, 74, 84, 91] },
  ];
  for (const ex of examDefs) {
    let exam = await db.exam.findFirst({ where: { schoolId: school.id, name: ex.name, academicYearId: year.id } });
    if (!exam) {
      exam = await db.exam.create({
        data: { schoolId: school.id, academicYearId: year.id, name: ex.name, type: ex.type, status: 'published', startDate: new Date(ex.start), endDate: new Date(ex.end) },
      });
    }
    await db.examResultPublish.deleteMany({ where: { schoolId: school.id, examId: exam.id, sectionId: section.id } });
    await db.examResultPublish.create({ data: { schoolId: school.id, examId: exam.id, sectionId: section.id, published: true } });
    await db.studentMark.createMany({
      data: subjects.map((s, i) => ({ schoolId: school.id, studentId: student.id, examId: exam.id, subjectId: s.id, marks: ex.marks[i] })),
    });
    // Exam schedule (one paper per subject) — powers the teacher marks-entry subject picker
    await db.examSchedule.deleteMany({ where: { schoolId: school.id, examId: exam.id } });
    await db.examSchedule.createMany({
      data: subjects.map((s) => ({ schoolId: school.id, examId: exam.id, classId: klass.id, subjectId: s.id, examDate: new Date(ex.start), maxMarks: 100, minMarks: 33 })),
    });
    // ExamSubject links — required by the marks-entry validation (enterStudentMarks)
    await db.examSubject.deleteMany({ where: { examId: exam.id } });
    await db.examSubject.createMany({
      data: subjects.map((s) => ({ examId: exam.id, subjectId: s.id, totalMarks: 100, passingMarks: 33 })),
    });
  }

  // 10. Class content — Homework / Diary / Syllabus / Holiday / Events / Online Class / Study Docs
  const sec = section.id;
  await db.classContent.deleteMany({ where: { schoolId: school.id } });
  await db.classContent.createMany({
    data: [
      // Homework (section)
      { schoolId: school.id, type: 'HOMEWORK', title: 'Maths — Exercise 4.2', description: 'Q1 to Q10 complete karo.', subjectName: 'Maths', sectionId: sec, dueDate: new Date('2026-08-22') },
      { schoolId: school.id, type: 'HOMEWORK', title: 'Science — Diagram of plant cell', description: 'Neatly labelled diagram.', subjectName: 'Science', sectionId: sec, dueDate: new Date('2026-08-24') },
      { schoolId: school.id, type: 'HOMEWORK', title: 'English — Essay on My School', description: '150 words.', subjectName: 'English', sectionId: sec, dueDate: new Date('2026-08-25') },
      // Daily Diary (section)
      { schoolId: school.id, type: 'DIARY', title: 'Class notes — 19 Aug', description: 'Covered fractions; bring geometry box tomorrow.', sectionId: sec, date: new Date('2026-08-19') },
      { schoolId: school.id, type: 'DIARY', title: 'Class notes — 18 Aug', description: 'Photosynthesis intro; revise chapter 6.', sectionId: sec, date: new Date('2026-08-18') },
      // Syllabus (section)
      { schoolId: school.id, type: 'SYLLABUS', title: 'Maths — Term 1 Syllabus', description: 'Ch 1-5: Numbers, Fractions, Geometry basics.', subjectName: 'Maths', sectionId: sec },
      { schoolId: school.id, type: 'SYLLABUS', title: 'Science — Term 1 Syllabus', description: 'Ch 1-6: Plants, Animals, Matter.', subjectName: 'Science', sectionId: sec },
      // Holiday (school-wide)
      { schoolId: school.id, type: 'HOLIDAY', title: 'Independence Day', description: 'National Holiday', date: new Date('2026-08-15') },
      { schoolId: school.id, type: 'HOLIDAY', title: 'Raksha Bandhan', description: 'School closed', date: new Date('2026-08-28') },
      { schoolId: school.id, type: 'HOLIDAY', title: 'Gandhi Jayanti', description: 'National Holiday', date: new Date('2026-10-02') },
      // Events (school-wide)
      { schoolId: school.id, type: 'EVENT', title: 'Annual Sports Day', description: 'Ground, 8 AM. Sports uniform.', date: new Date('2026-09-05') },
      { schoolId: school.id, type: 'EVENT', title: 'Science Exhibition', description: 'Auditorium. Parents invited.', date: new Date('2026-09-18') },
      // Online Class (section)
      { schoolId: school.id, type: 'ONLINE_CLASS', title: 'Maths — Doubt session', description: 'Live on Zoom.', subjectName: 'Maths', sectionId: sec, date: new Date('2026-08-21'), link: 'https://zoom.us/j/demo-maths' },
      { schoolId: school.id, type: 'ONLINE_CLASS', title: 'Science — Revision', subjectName: 'Science', sectionId: sec, date: new Date('2026-08-23'), link: 'https://meet.google.com/demo-sci' },
      // Study Documents (section)
      { schoolId: school.id, type: 'STUDY_DOC', title: 'Maths formulas sheet', subjectName: 'Maths', sectionId: sec, link: 'https://files.example.com/maths-formulas.pdf' },
      { schoolId: school.id, type: 'STUDY_DOC', title: 'Science notes Ch 1-3', subjectName: 'Science', sectionId: sec, link: 'https://files.example.com/science-notes.pdf' },
    ],
  });

  // 11. Demo teacher (Employee) — class teacher of Class 5 A
  const tpass = await bcrypt.hash('teacher123', 10);
  let tuser = await db.user.findFirst({ where: { email: 'demo.teacher@school.com', schoolId: school.id } });
  if (!tuser) {
    tuser = await db.user.create({
      data: {
        schoolId: school.id, firstName: 'Priya', lastName: 'Verma',
        email: 'demo.teacher@school.com', phone: '9000000002',
        password: tpass, role: 'TEACHER', isActive: true, emailVerified: true,
      },
    });
  } else {
    tuser = await db.user.update({ where: { id: tuser.id }, data: { password: tpass, isActive: true, role: 'TEACHER' } });
  }
  const teacherPhoto = 'https://i.pravatar.cc/240?img=47';
  let teacher = await db.employee.findUnique({ where: { userId: tuser.id } });
  if (!teacher) {
    teacher = await db.employee.create({
      data: { schoolId: school.id, userId: tuser.id, employeeCode: 'EMP-001', gender: 'Female', photo: teacherPhoto },
    });
  } else {
    teacher = await db.employee.update({ where: { id: teacher.id }, data: { photo: teacherPhoto } });
  }
  // Make Priya the class teacher and the teacher on every period, so her
  // employee timetable is populated.
  await db.classTimetable.update({ where: { id: tt.id }, data: { classTeacherId: teacher.id } });
  await db.classTimetableCell.updateMany({ where: { timetableId: tt.id }, data: { teacherId: teacher.id } });

  // Teacher salary structure + payment history (powers the Salary module)
  await db.employee.update({ where: { id: teacher.id }, data: { baseSalary: BigInt(45000) } });
  await db.salaryPayment.deleteMany({ where: { employeeId: teacher.id } });
  await db.salaryPayment.createMany({
    data: [
      { schoolId: school.id, employeeId: teacher.id, year: 2026, months: [6], monthCount: 1, monthlySalary: BigInt(45000), allowances: BigInt(5000), deductions: BigInt(3000), totalAmount: BigInt(47000), paymentMode: 'BANK_TRANSFER', status: 'PAID', paidDate: new Date('2026-06-30') },
      { schoolId: school.id, employeeId: teacher.id, year: 2026, months: [7], monthCount: 1, monthlySalary: BigInt(45000), allowances: BigInt(5000), deductions: BigInt(3000), totalAmount: BigInt(47000), paymentMode: 'BANK_TRANSFER', status: 'PAID', paidDate: new Date('2026-07-31') },
      { schoolId: school.id, employeeId: teacher.id, year: 2026, months: [8], monthCount: 1, monthlySalary: BigInt(45000), allowances: BigInt(5000), deductions: BigInt(3000), totalAmount: BigInt(47000), paymentMode: 'UPI', status: 'PAID', paidDate: new Date('2026-08-31') },
    ],
  });

  // 11b. Demo school admin
  const apass = await bcrypt.hash('admin123', 10);
  let auser = await db.user.findFirst({ where: { email: 'demo.admin@school.com', schoolId: school.id } });
  if (!auser) {
    auser = await db.user.create({
      data: {
        schoolId: school.id, firstName: 'Rajesh', lastName: 'Gupta',
        email: 'demo.admin@school.com', phone: '9000000003',
        password: apass, role: 'SCHOOL_ADMIN', isActive: true, emailVerified: true,
      },
    });
  } else {
    auser = await db.user.update({ where: { id: auser.id }, data: { password: apass, isActive: true, role: 'SCHOOL_ADMIN' } });
  }

  // 11c. Extra students (so the admin Students list is meaningful)
  const extra = [
    ['Isha', 'Patel', 'Female', '5A-02'], ['Rohan', 'Mehta', 'Male', '5A-03'],
    ['Ananya', 'Singh', 'Female', '5A-04'], ['Kabir', 'Nair', 'Male', '5A-05'],
    ['Diya', 'Reddy', 'Female', '5A-06'], ['Arjun', 'Iyer', 'Male', '5A-07'],
  ];
  const stuPass = await bcrypt.hash('student123', 10);
  for (const [fn, ln, gender, roll] of extra) {
    const em = `${fn.toLowerCase()}.${ln.toLowerCase()}@school.com`;
    let u = await db.user.findFirst({ where: { email: em, schoolId: school.id } });
    if (!u) u = await db.user.create({ data: { schoolId: school.id, firstName: fn, lastName: ln, email: em, password: stuPass, role: 'STUDENT', isActive: true, emailVerified: true } });
    const ex = await db.student.findUnique({ where: { userId: u.id } });
    if (!ex) await db.student.create({ data: { schoolId: school.id, userId: u.id, sectionId: section.id, rollNumber: roll, admissionNumber: `ADM-${roll}`, dateOfBirth: new Date('2015-05-01'), gender, session: '2026-27' } });
  }

  // Demo parent (Rakesh Sharma) linked to Aarav + Isha — powers the Parent app.
  const parentPass = await bcrypt.hash('parent123', 10);
  let pUser = await db.user.findFirst({ where: { email: 'demo.parent@school.com', schoolId: school.id } });
  if (!pUser) {
    pUser = await db.user.create({ data: { schoolId: school.id, firstName: 'Rakesh', lastName: 'Sharma', email: 'demo.parent@school.com', phone: '9000000003', password: parentPass, role: 'PARENT', isActive: true, emailVerified: true } });
  } else {
    pUser = await db.user.update({ where: { id: pUser.id }, data: { password: parentPass, role: 'PARENT', isActive: true } });
  }
  let parent = await db.parent.findFirst({ where: { schoolId: school.id, userId: pUser.id } });
  if (!parent) parent = await db.parent.create({ data: { schoolId: school.id, userId: pUser.id, relationship: 'Father' } });
  const isha = await db.student.findFirst({ where: { schoolId: school.id, rollNumber: '5A-02' } });
  await db.parent.update({ where: { id: parent.id }, data: { students: { set: [{ id: student.id }, ...(isha ? [{ id: isha.id }] : [])] } } });

  // Leave types (for the teacher Leave module)
  for (const lt of [['Casual Leave', 'CL', 12], ['Sick Leave', 'SL', 10], ['Earned Leave', 'EL', 15]]) {
    const [name, shortName, maxDays] = lt;
    const exists = await db.leaveType.findFirst({ where: { schoolId: school.id, shortName } });
    if (!exists) await db.leaveType.create({ data: { schoolId: school.id, name, shortName, maxDays, paid: true } });
  }

  // Admission enquiries — a small pipeline so the Admission module is demoable.
  const enquiryDefs = [
    { studentName: 'Riya Kapoor', phone: '9812300011', classApplying: '6', parentName: 'Anil Kapoor', gender: 'Female', dateOfBirth: new Date('2014-03-14'), status: 'ENQUIRY', source: 'Walk-in' },
    { studentName: 'Kabir Nair', phone: '9812300022', classApplying: '5', parentName: 'Meera Nair', gender: 'Male', dateOfBirth: new Date('2015-07-02'), status: 'CONTACTED', source: 'Website' },
    { studentName: 'Sara Khan', phone: '9812300033', classApplying: '6', parentName: 'Imran Khan', gender: 'Female', dateOfBirth: new Date('2014-11-20'), status: 'REGISTERED', source: 'Referral' },
  ];
  for (const def of enquiryDefs) {
    const exists = await db.admissionEnquiry.findFirst({ where: { schoolId: school.id, studentName: def.studentName, phone: def.phone } });
    if (!exists) await db.admissionEnquiry.create({ data: { schoolId: school.id, ...def } });
  }

  // ── Grading scale (powers letter grades in Results / report cards) ─────────
  const gradeBands = [
    ['A+', 90, 100, 10], ['A', 80, 89, 9], ['B', 70, 79, 8], ['C', 60, 69, 7],
    ['D', 45, 59, 6], ['E', 33, 44, 5], ['F', 0, 32, 0],
  ];
  for (const [grade, minPercent, maxPercent, gradePoint] of gradeBands) {
    const g = await db.gradingScale.findFirst({ where: { schoolId: school.id, grade } });
    if (!g) await db.gradingScale.create({ data: { schoolId: school.id, grade, minPercent, maxPercent, gradePoint } });
  }

  // ── Notices / announcements ────────────────────────────────────────────────
  const noticeDefs = [
    { title: 'Annual Sports Day 🏅', message: 'Annual Sports Day on 15 Sep. All students to report by 8:00 AM in sports uniform.' },
    { title: 'PTM this Saturday', message: 'Parent-Teacher Meeting on Saturday 10 AM–1 PM. Report cards will be shared.' },
    { title: 'Fee reminder', message: 'Kindly clear pending fees before the 10th to avoid late fine.' },
  ];
  for (const n of noticeDefs) {
    const ex = await db.notification.findFirst({ where: { schoolId: school.id, title: n.title } });
    if (!ex) await db.notification.create({ data: { schoolId: school.id, title: n.title, message: n.message, type: 'ANNOUNCEMENT', isRead: false } });
  }

  // ── Staff leave applications (powers Leave Approval) ───────────────────────
  const clType = await db.leaveType.findFirst({ where: { schoolId: school.id, shortName: 'CL' } });
  if (clType) {
    const leaveDefs = [
      { startDate: new Date('2026-09-14'), endDate: new Date('2026-09-15'), days: 2, reason: 'Family function', status: 'PENDING' },
      { startDate: new Date('2026-07-20'), endDate: new Date('2026-07-20'), days: 1, reason: 'Medical', status: 'APPROVED' },
    ];
    for (const l of leaveDefs) {
      const ex = await db.leave.findFirst({ where: { schoolId: school.id, employeeId: teacher.id, startDate: l.startDate } });
      if (!ex) await db.leave.create({ data: { schoolId: school.id, employeeId: teacher.id, leaveTypeId: clType.id, startDate: l.startDate, endDate: l.endDate, days: l.days, actualDays: l.days, reason: l.reason, status: l.status } });
    }
  }

  // ── Transport: a bus route with live GPS tracking ──────────────────────────
  let veh = await db.transportVehicle.findFirst({ where: { schoolId: school.id, vehicleNumber: 'MP-09-BUS-1234' } });
  if (!veh) veh = await db.transportVehicle.create({ data: { schoolId: school.id, name: 'School Bus 1', vehicleNumber: 'MP-09-BUS-1234', seatCapacity: 40, gpsDeviceId: 'GPS-DEMO-01' } });
  let drv = await db.transportDriver.findFirst({ where: { schoolId: school.id, licenseNo: 'MP09-2020-99887' } });
  if (!drv) drv = await db.transportDriver.create({ data: { schoolId: school.id, name: 'Ramesh Yadav', licenseNo: 'MP09-2020-99887', phone: '9822000111' } });
  const stopDefs = [
    ['Vijay Nagar Square', 22.7530, 75.8937], ['Palasia', 22.7280, 75.8840],
    ['Geeta Bhawan', 22.7150, 75.8760], ['Demo Public School', 22.6970, 75.8650],
  ];
  const stopIds = [];
  for (const [name, latitude, longitude] of stopDefs) {
    let s = await db.transportStoppage.findFirst({ where: { schoolId: school.id, name } });
    if (!s) s = await db.transportStoppage.create({ data: { schoolId: school.id, name, latitude, longitude } });
    stopIds.push(s.id);
  }
  let route = await db.transportRoute.findFirst({ where: { schoolId: school.id, name: 'Route A – North' } });
  if (!route) route = await db.transportRoute.create({ data: { schoolId: school.id, name: 'Route A – North', routeFrom: 'Vijay Nagar', routeTo: 'Demo Public School', vehicleId: veh.id, driverId: drv.id } });
  const stopTypes = ['START_POINT', 'STOPPAGE_POINT', 'STOPPAGE_POINT', 'END_POINT'];
  const stopTimes = ['07:30', '07:40', '07:50', '08:05'];
  for (let i = 0; i < stopIds.length; i++) {
    const ex = await db.transportRouteStoppage.findFirst({ where: { routeId: route.id, stoppageId: stopIds[i] } });
    if (!ex) await db.transportRouteStoppage.create({ data: { schoolId: school.id, routeId: route.id, stoppageId: stopIds[i], stopType: stopTypes[i], time: stopTimes[i], sequenceNo: i } });
  }
  const sr = await db.transportStudentRoute.findFirst({ where: { studentId: student.id, academicYearId: null } });
  if (!sr) await db.transportStudentRoute.create({ data: { schoolId: school.id, routeId: route.id, stoppageId: stopIds[0], studentId: student.id, academicYearId: null } });
  const rloc = await db.transportRouteLocation.findUnique({ where: { routeId: route.id } });
  if (!rloc) await db.transportRouteLocation.create({ data: { schoolId: school.id, routeId: route.id, latitude: 22.7480, longitude: 75.8900, speed: 24, heading: 220, moving: true } });

  const attCount = await db.studentAttendance.count({ where: { studentId: student.id } });
  const dueCount = await db.feeCollection.count({ where: { studentId: student.id, status: 'PENDING' } });
  const rcptCount = await db.feePayment.count({ where: { studentId: student.id } });
  const ttCells = await db.classTimetableCell.count({ where: { timetableId: tt.id } });
  const markCount = await db.studentMark.count({ where: { studentId: student.id } });
  const contentCount = await db.classContent.count({ where: { schoolId: school.id } });

  console.log('✅ Demo student seeded');
  console.log('   School :', school.name, `(${school.slug})`);
  console.log('   Student: demo.student@school.com / student123');
  console.log('   Teacher: demo.teacher@school.com / teacher123');
  console.log('   Admin  : demo.admin@school.com   / admin123');
  console.log('   Class  : Class 5 · Section A · Roll 5A-01');
  console.log(`   Data   : ${attCount} attendance, ${dueCount} dues, ${rcptCount} receipts, ${ttCells} periods, ${markCount} marks, ${contentCount} content items`);
  console.log('   Extra  : grading scale, notices, staff leave, transport route (live GPS)');
}

main()
  .catch((e) => { console.error('SEED FAILED:', e); process.exit(1); })
  .finally(() => db.$disconnect());
