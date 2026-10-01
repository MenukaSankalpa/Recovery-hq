import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const Id = Schema.Types.ObjectId;

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ceo', 'staff'], default: 'staff' },
    canEnter: { type: Boolean, default: false }, // can add / edit customers
    canCollect: { type: Boolean, default: true }, // can be assigned groups & record collections
    team: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

const InvoiceSchema = new Schema(
  {
    ref: { type: String, default: '' },
    date: Date,
    creditPeriodDays: { type: Number, default: 0 },
    dueDate: Date,
    amount: { type: Number, default: 0 }, // negative = credit note / unapplied payment
    note: { type: String, default: '' },
  },
  { _id: false }
);

const CustomerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    company: { type: String, default: '', trim: true }, // group company code e.g. CLL, CTL, MSTS
    code: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    contactPerson: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    invoiceNo: { type: String, default: '', trim: true },
    amount: { type: Number, required: true, min: 0 }, // AR value (what the customer must pay)
    creditStartDate: { type: Date, required: true }, // payment / credit start date
    creditPeriodDays: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    paidAmount: { type: Number, default: 0 },
    creditBalance: { type: Number, default: 0 }, // customer owes nothing, we hold their money (unapplied receipts / credit notes)
    lastPaymentAt: Date,
    lastActivityAt: Date,
    lastOutcome: { type: String, default: '' },
    group: { type: Id, ref: 'Group', default: null },
    notes: { type: String, default: '' },
    invoices: { type: [InvoiceSchema], default: [] }, // from AR master import
    createdBy: { type: Id, ref: 'User' },
  },
  { timestamps: true }
);
CustomerSchema.index({ group: 1 });
CustomerSchema.index({ company: 1, name: 1 });
CustomerSchema.index({ dueDate: 1 });

const GroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    customers: [{ type: Id, ref: 'Customer' }],
    assignees: [{ type: Id, ref: 'User' }],
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    color: { type: String, default: '#10b981' },
    notes: { type: String, default: '' },
    createdBy: { type: Id, ref: 'User' },
    closedAt: Date,
  },
  { timestamps: true }
);

// One row per collection attempt:
//  payment    = money received (full / partial)
//  no_payment = visit / call without money, with reason
//  promise    = customer committed to pay `amount` on `promiseDate` (not counted as collected)
const CollectionSchema = new Schema(
  {
    customer: { type: Id, ref: 'Customer', required: true },
    group: { type: Id, ref: 'Group', default: null },
    user: { type: Id, ref: 'User', required: true },
    type: { type: String, enum: ['payment', 'no_payment', 'promise'], required: true },
    amount: { type: Number, default: 0, min: 0 },
    method: { type: String, default: '' },
    reference: { type: String, default: '' },
    reason: { type: String, default: '' },
    promiseDate: Date,
    status: { type: String, enum: ['open', 'kept', 'cancelled'] }, // promises only
    fulfilled: { type: Number, default: 0 }, // promises only: paid against this promise so far
    keptAt: Date,
    date: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);
CollectionSchema.index({ date: -1 });
CollectionSchema.index({ customer: 1, date: -1 });
CollectionSchema.index({ group: 1 });
CollectionSchema.index({ user: 1, date: -1 });
CollectionSchema.index({ type: 1, status: 1, promiseDate: 1 });

const SessionSchema = new Schema({
  user: { type: Id, ref: 'User', required: true },
  loginAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
  logoutAt: Date,
  logoutReason: { type: String, enum: ['manual', 'idle', 'expired', 'disabled', null], default: null },
  ip: String,
  userAgent: String,
});
SessionSchema.index({ loginAt: -1 });
SessionSchema.index({ user: 1, loginAt: -1 });

const SettingSchema = new Schema({
  key: { type: String, default: 'app', unique: true },
  companyName: { type: String, default: 'Recovery HQ' },
  currency: { type: String, default: 'LKR' },
  agingBuckets: { type: [Number], default: [30, 60, 90] },
  agingBasis: { type: String, enum: ['overdue', 'age'], default: 'overdue' },
});

export const User = models.User || model('User', UserSchema);
export const Customer = models.Customer || model('Customer', CustomerSchema);
export const Group = models.Group || model('Group', GroupSchema);
export const Collection = models.Collection || model('Collection', CollectionSchema);
export const Session = models.Session || model('Session', SessionSchema);
export const Setting = models.Setting || model('Setting', SettingSchema);

export async function getSettings() {
  let s = await Setting.findOne({ key: 'app' }).lean();
  if (!s) s = (await Setting.create({ key: 'app' })).toObject();
  return s;
}
