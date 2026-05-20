# PharmaPulse — نظام إدارة KPI الصيدليات

نظام SaaS احترافي لمتابعة أداء الصيادلة والفروع في الوقت الفعلي.
مبني بـ **React 19 + Vite + Firebase + TailwindCSS**.

---

## 🚀 التشغيل السريع

```bash
git clone https://github.com/your-org/pharmapulse.git
cd pharmapulse
npm install
cp .env.example .env      # ثم عدّل القيم
npm run dev               # http://localhost:5173
```

---

## ⚙️ إعداد Firebase

### 1. إنشاء مشروع Firebase

1. توجّه إلى [Firebase Console](https://console.firebase.google.com)
2. أنشئ مشروعاً جديداً (اسم مقترح: `pharmapulse`)
3. أضف **تطبيق ويب** واحفظ بيانات التكوين

### 2. تفعيل الخدمات

| الخدمة | الإعداد |
|--------|---------|
| **Authentication** | Email/Password فقط |
| **Firestore** | Native mode — ابدأ بـ Test Mode ثم طبّق Rules |
| **Hosting** | اختياري (نستخدم Netlify) |

### 3. ملف .env

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
VITE_DEMO_MODE=false
```

### 4. نشر Firestore Rules

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # اختر مشروعك
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 5. إنشاء أول Admin

في Firebase Console → Authentication → Add User:
- البريد: admin@yourcompany.com
- كلمة المرور: (قوية)

ثم في Firestore → users → أضف document بنفس uid:

```json
{
  "displayName": "مدير النظام",
  "email": "admin@yourcompany.com",
  "role": "admin",
  "branchId": null,
  "regionId": null,
  "active": true,
  "createdAt": "2025-01-01T00:00:00Z"
}
```

---

## 🏗️ هيكل Firestore

```
users/            → بيانات المستخدمين + أدوارهم
pharmacies/       → الفروع والصيدليات
regions/          → المناطق الجغرافية
targets/          → الأهداف لكل فرع/KPI/شهر
kpi_templates/    → تعريفات مؤشرات الأداء
kpi_entries/      → إدخالات KPI اليومية
approvals/        → سجل الاعتماد
audit_logs/       → سجل كل العمليات
notifications/    → الإشعارات
settings/         → إعدادات النظام
```

---

## 👥 أدوار المستخدمين

| الدور | الصلاحيات |
|-------|----------|
| **admin** | كامل الصلاحيات على كل شيء |
| **area_manager** | فروع منطقته فقط |
| **store_manager** | فرعه وفريقه فقط |
| **pharmacist** | بياناته الشخصية فقط |

---

## 📦 استيراد البيانات (Excel)

1. توجّه إلى **استيراد Excel** في القائمة
2. اختر نوع البيانات (فروع / مستخدمون / أهداف)
3. نزّل template الـ Excel
4. عبّئ البيانات واحفظ
5. ارفع الملف → معاينة → استيراد

---

## 🌐 النشر على Netlify

```bash
# Build
npm run build

# متغيرات البيئة في Netlify Dashboard:
# Site Settings → Environment Variables → أضف كل VITE_* variables
```

أو اربط الـ Repository مع Netlify للنشر التلقائي.

---

## 🔧 أوامر مفيدة

```bash
npm run dev       # تشغيل التطوير
npm run build     # بناء الإنتاج
npm run preview   # معاينة build محلياً
npm run lint      # فحص الكود
```

---

## 🛡️ وضع Demo

لتشغيل المشروع بدون Firebase:
```env
VITE_DEMO_MODE=true
```

بيانات الدخول التجريبية:
| الدور | البريد | كلمة المرور |
|-------|--------|-------------|
| Admin | admin@pharmapulse.com | Admin@123 |
| مدير منطقة | area@pharmapulse.com | Area@123 |
| مدير فرع | manager@pharmapulse.com | Manager@123 |
| صيدلاني | pharma@pharmapulse.com | Pharma@123 |
