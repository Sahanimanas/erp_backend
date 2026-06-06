import { db } from '@common/database/client';

type TxnType = 'INCOME' | 'EXPENSE';

interface CreateAccountInput {
  name: string;
  type?: 'CASH' | 'BANK';
  accountNumber?: string;
  bankName?: string;
  openingBalance?: number | string;
}

interface CreateVoucherHeadInput {
  name: string;
  type: TxnType;
  description?: string;
}

interface CreateTransactionInput {
  accountId: string;
  voucherHeadId?: string;
  type: TxnType;
  amount: number | string;
  date?: string;
  description?: string;
  reference?: string;
}

export class AccountingService {
  // ── Accounts ──────────────────────────────────────────────────────────
  async createAccount(schoolId: string, data: CreateAccountInput) {
    return db.account.create({
      data: {
        schoolId,
        name: data.name,
        type: (data.type as any) || 'CASH',
        accountNumber: data.accountNumber,
        bankName: data.bankName,
        openingBalance: BigInt(data.openingBalance || 0),
      },
    });
  }

  async listAccounts(schoolId: string) {
    const accounts = await db.account.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    // Compute current balance = opening + income - expense per account
    const sums = await db.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { schoolId, deletedAt: null },
      _sum: { amount: true },
    });

    return accounts.map((a) => {
      const income = sums.find((s) => s.accountId === a.id && s.type === 'INCOME')?._sum.amount || BigInt(0);
      const expense = sums.find((s) => s.accountId === a.id && s.type === 'EXPENSE')?._sum.amount || BigInt(0);
      const currentBalance = Number(a.openingBalance) + Number(income) - Number(expense);
      return { ...a, currentBalance };
    });
  }

  // ── Voucher Heads ─────────────────────────────────────────────────────
  async createVoucherHead(schoolId: string, data: CreateVoucherHeadInput) {
    return db.voucherHead.create({
      data: { schoolId, name: data.name, type: data.type as any, description: data.description },
    });
  }

  async listVoucherHeads(schoolId: string, type?: TxnType) {
    return db.voucherHead.findMany({
      where: { schoolId, deletedAt: null, ...(type && { type: type as any }) },
      orderBy: { name: 'asc' },
    });
  }

  // ── Transactions ──────────────────────────────────────────────────────
  async createTransaction(schoolId: string, createdBy: string | undefined, data: CreateTransactionInput) {
    const account = await db.account.findFirst({ where: { id: data.accountId, schoolId } });
    if (!account) throw new Error('Account not found');

    if (data.voucherHeadId) {
      const vh = await db.voucherHead.findFirst({ where: { id: data.voucherHeadId, schoolId } });
      if (!vh) throw new Error('Voucher head not found');
    }

    const date = data.date ? new Date(data.date) : new Date();
    if (isNaN(date.getTime())) throw new Error('A valid date is required');

    return db.transaction.create({
      data: {
        schoolId,
        accountId: data.accountId,
        voucherHeadId: data.voucherHeadId || null,
        type: data.type as any,
        amount: BigInt(data.amount),
        date,
        description: data.description,
        reference: data.reference,
        createdBy,
      },
      include: { account: { select: { name: true } }, voucherHead: { select: { name: true } } },
    });
  }

  async listTransactions(
    schoolId: string,
    page = 1,
    limit = 20,
    filters: { type?: TxnType; accountId?: string } = {}
  ) {
    const skip = (page - 1) * limit;
    const where: any = { schoolId, deletedAt: null };
    if (filters.type) where.type = filters.type;
    if (filters.accountId) where.accountId = filters.accountId;

    const [data, total] = await Promise.all([
      db.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: { account: { select: { name: true } }, voucherHead: { select: { name: true } } },
      }),
      db.transaction.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getSummary(schoolId: string, startDate?: Date, endDate?: Date) {
    const where: any = { schoolId, deletedAt: null };
    if (startDate && endDate) where.date = { gte: startDate, lte: endDate };

    const sums = await db.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
    });

    const income = Number(sums.find((s) => s.type === 'INCOME')?._sum.amount || 0);
    const expense = Number(sums.find((s) => s.type === 'EXPENSE')?._sum.amount || 0);
    return { income, expense, net: income - expense };
  }
}

export default new AccountingService();
