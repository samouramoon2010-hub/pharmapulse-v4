// ============================================================
// Demo Data — PharmaPulse v3
// 3 branches · 3 managers · 9 pharmacists · 30 days
// ============================================================

export const DUMMY_BRANCHES = [
  { id: 'b1', name: 'فرع العليا',   code: 'ALY', region: 'الرياض', active: true, targetMonthly: 150000 },
  { id: 'b2', name: 'فرع الملز',    code: 'MLZ', region: 'الرياض', active: true, targetMonthly: 120000 },
  { id: 'b3', name: 'فرع النزهة',   code: 'NZH', region: 'جدة',    active: true, targetMonthly: 130000 },
]

export const DUMMY_USERS = [
  { uid:'admin-1',   email:'admin@pharmapulse.com',    password:'Admin@123',    displayName:'أحمد المدير',        role:'admin',      branchId:null, phone:'0501111111' },
  { uid:'mgr-1',     email:'manager@pharmapulse.com',  password:'Manager@123',  displayName:'محمد مدير العليا',   role:'manager',    branchId:'b1', phone:'0502222222' },
  { uid:'mgr-2',     email:'manager2@pharmapulse.com', password:'Manager2@123', displayName:'نورة مديرة الملز',   role:'manager',    branchId:'b2', phone:'0502222223' },
  { uid:'mgr-3',     email:'manager3@pharmapulse.com', password:'Manager3@123', displayName:'عمر مدير النزهة',    role:'manager',    branchId:'b3', phone:'0502222224' },
  { uid:'ph-1',      email:'pharma@pharmapulse.com',   password:'Pharma@123',   displayName:'فاطمة الصيدلانية',   role:'pharmacist', branchId:'b1', phone:'0503333331' },
  { uid:'ph-2',      email:'pharma2@pharmapulse.com',  password:'Pharma2@123',  displayName:'علي الصيدلاني',      role:'pharmacist', branchId:'b1', phone:'0503333332' },
  { uid:'ph-3',      email:'pharma3@pharmapulse.com',  password:'Pharma3@123',  displayName:'منى العتيبي',         role:'pharmacist', branchId:'b1', phone:'0503333333' },
  { uid:'ph-4',      email:'pharma4@pharmapulse.com',  password:'Pharma4@123',  displayName:'يوسف الغامدي',       role:'pharmacist', branchId:'b2', phone:'0503333334' },
  { uid:'ph-5',      email:'pharma5@pharmapulse.com',  password:'Pharma5@123',  displayName:'ريم الحربي',          role:'pharmacist', branchId:'b2', phone:'0503333335' },
  { uid:'ph-6',      email:'pharma6@pharmapulse.com',  password:'Pharma6@123',  displayName:'بندر الشمري',         role:'pharmacist', branchId:'b2', phone:'0503333336' },
  { uid:'ph-7',      email:'pharma7@pharmapulse.com',  password:'Pharma7@123',  displayName:'هند المالكي',         role:'pharmacist', branchId:'b3', phone:'0503333337' },
  { uid:'ph-8',      email:'pharma8@pharmapulse.com',  password:'Pharma8@123',  displayName:'طارق القحطاني',      role:'pharmacist', branchId:'b3', phone:'0503333338' },
  { uid:'ph-9',      email:'pharma9@pharmapulse.com',  password:'Pharma9@123',  displayName:'لمياء الزهراني',     role:'pharmacist', branchId:'b3', phone:'0503333339' },
]

export const DUMMY_KPI_TEMPLATES = [
  { id:'kpi-1', name:'المبيعات',        type:'currency',   period:'daily', target:5000, unit:'ر.س',  color:'#1a9a7e', active:true, order:1, visibleTo:['pharmacist','manager','admin'] },
  { id:'kpi-2', name:'أومني هيلث',      type:'number',     period:'daily', target:10,   unit:'وحدة', color:'#ef4444', active:true, order:2, visibleTo:['pharmacist','manager','admin'] },
  { id:'kpi-3', name:'وصفتي',           type:'number',     period:'daily', target:8,    unit:'وصفة', color:'#6366f1', active:true, order:3, visibleTo:['pharmacist','manager','admin'] },
  { id:'kpi-4', name:'ويلنس',           type:'number',     period:'daily', target:12,   unit:'وحدة', color:'#f59e0b', active:true, order:4, visibleTo:['pharmacist','manager','admin'] },
  { id:'kpi-5', name:'البيع المتقاطع',  type:'number',     period:'daily', target:15,   unit:'وحدة', color:'#8b5cf6', active:true, order:5, visibleTo:['pharmacist','manager','admin'] },
]

// Performance profiles (realistic variance)
const PROFILES = {
  'ph-1': { base: 0.95, var: 0.08 },
  'ph-2': { base: 0.78, var: 0.12 },
  'ph-3': { base: 1.05, var: 0.06 },
  'ph-4': { base: 0.65, var: 0.15 },
  'ph-5': { base: 0.88, var: 0.10 },
  'ph-6': { base: 0.72, var: 0.13 },
  'ph-7': { base: 0.90, var: 0.09 },
  'ph-8': { base: 1.02, var: 0.05 },
  'ph-9': { base: 0.60, var: 0.18 },
}

export function generateDummyEntries() {
  const entries = []
  const today   = new Date()
  const pharmacists = DUMMY_USERS.filter((u) => u.role === 'pharmacist')
  const inputKpis   = DUMMY_KPI_TEMPLATES.filter((k) => k.type !== 'formula')

  pharmacists.forEach((user) => {
    const profile = PROFILES[user.uid] || { base: 0.80, var: 0.12 }

    for (let i = 0; i < 30; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      // Skip ~15% of days
      if (Math.random() < 0.15 && i > 0) continue
      const dateStr = d.toISOString().split('T')[0]

      inputKpis.forEach((kpi) => {
        const mult  = profile.base + (Math.random() - 0.5) * profile.var * 2
        let value   = kpi.target * Math.max(0.1, mult)
        if (kpi.type === 'number')   value = Math.round(value)
        if (kpi.type === 'currency') value = Math.round(value / 100) * 100
        const achievement = Math.round((value / kpi.target) * 100)

        entries.push({
          id:          `e-${user.uid}-${kpi.id}-${dateStr}`,
          userId:      user.uid,
          branchId:    user.branchId,
          kpiId:       kpi.id,
          kpiName:     kpi.name,
          value,
          target:      kpi.target,
          achievement,
          date:        dateStr,
          period:      'daily',
          status:      'pending',
          createdAt:   d.toISOString(),
          updatedAt:   d.toISOString(),
        })
      })
    }
  })
  return entries
}

export const DEMO_CREDENTIALS = [
  { role: 'Admin',    email: 'admin@pharmapulse.com',   password: 'Admin@123',   color: '#ef4444' },
  { role: 'مدير فرع', email: 'manager@pharmapulse.com', password: 'Manager@123', color: '#f59e0b' },
  { role: 'صيدلاني',  email: 'pharma@pharmapulse.com',  password: 'Pharma@123',  color: '#1a9a7e' },
]
