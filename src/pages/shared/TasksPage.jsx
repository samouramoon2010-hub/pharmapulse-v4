// ============================================================
// Tasks Management Page
// ============================================================

import React, { useEffect, useState } from 'react'
import {
  CheckSquare, Plus, Clock, AlertCircle, CheckCircle2,
  Circle, Trash2, X, Save, Loader2, Calendar, User,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useTaskStore } from '../../store/taskStore'
import { DUMMY_USERS } from '../../data/dummyData'
import { todayStr } from '../../utils/helpers'

const STATUS_CONFIG = {
  pending:     { label: 'معلّقة',      icon: Circle,       color: 'text-slate-400',  bg: 'bg-slate-800/60 border-slate-700' },
  in_progress: { label: 'قيد التنفيذ', icon: Clock,        color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  done:        { label: 'مكتملة',      icon: CheckCircle2, color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
}

const PRIORITY_CONFIG = {
  low:    { label: 'منخفضة', color: 'text-slate-400', badge: 'bg-slate-800 border-slate-700' },
  medium: { label: 'متوسطة', color: 'text-blue-400',  badge: 'bg-blue-500/10 border-blue-500/20' },
  high:   { label: 'عالية',  color: 'text-red-400',   badge: 'bg-red-500/10 border-red-500/20' },
}

const DEFAULT_FORM = {
  title: '', description: '', assignedTo: '', priority: 'medium',
  status: 'pending', dueDate: todayStr(),
}

export default function TasksPage() {
  const { userProfile } = useAuthStore()
  const { tasks, fetchTasks, createTask, updateTaskStatus, deleteTask } = useTaskStore()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => { fetchTasks(userProfile?.uid) }, [userProfile?.uid])

  const teamMembers = DUMMY_USERS.filter(
    (u) => u.role === 'pharmacist' && u.branchId === userProfile?.branchId
  )

  const filtered = tasks.filter((t) => filter === 'all' ? true : t.status === filter)

  const counts = {
    all: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }

  const handleCreate = async () => {
    if (!form.title) return
    setSaving(true)
    try {
      createTask({
        ...form,
        assignedBy: userProfile?.uid,
        branchId: userProfile?.branchId,
      })
      setShowForm(false)
      setForm(DEFAULT_FORM)
    } finally {
      setSaving(false)
    }
  }

  const getMemberName = (uid) => DUMMY_USERS.find((u) => u.uid === uid)?.displayName || uid

  const statusCycle = { pending: 'in_progress', in_progress: 'done', done: 'pending' }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">المهام</h1>
          <p className="text-sm text-slate-400 mt-0.5">{tasks.length} مهمة إجمالياً</p>
        </div>
        {userProfile?.role !== 'pharmacist' && (
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> مهمة جديدة
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries({ all: 'الكل', pending: 'معلّقة', in_progress: 'قيد التنفيذ', done: 'مكتملة' }).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`badge transition-all ${
              filter === k
                ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                : 'bg-slate-800/60 text-slate-500 border-slate-700 hover:border-slate-600'
            }`}
          >
            {label}
            <span className={`ml-1 text-xs font-bold ${filter === k ? 'text-brand-300' : 'text-slate-600'}`}>
              {counts[k]}
            </span>
          </button>
        ))}
      </div>

      {/* Tasks list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="kpi-card text-center py-12">
            <CheckSquare className="w-8 h-8 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500">لا توجد مهام</p>
          </div>
        )}

        {filtered.map((task) => {
          const statusCfg = STATUS_CONFIG[task.status]
          const priorityCfg = PRIORITY_CONFIG[task.priority]
          const StatusIcon = statusCfg.icon
          const isOverdue = task.dueDate < todayStr() && task.status !== 'done'

          return (
            <div
              key={task.id}
              className={`kpi-card transition-all ${task.status === 'done' ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-3">
                {/* Status toggle */}
                <button
                  onClick={() => updateTaskStatus(task.id, statusCycle[task.status])}
                  className={`mt-0.5 flex-shrink-0 ${statusCfg.color} hover:scale-110 transition-transform`}
                >
                  <StatusIcon className="w-5 h-5" />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={`text-sm font-semibold text-slate-200 ${task.status === 'done' ? 'line-through text-slate-500' : ''}`}>
                      {task.title}
                    </span>
                    <span className={`badge text-xs ${priorityCfg.badge} ${priorityCfg.color}`}>
                      {priorityCfg.label}
                    </span>
                    {isOverdue && (
                      <span className="badge text-xs bg-red-500/10 text-red-400 border-red-500/20">
                        متأخرة
                      </span>
                    )}
                  </div>

                  {task.description && (
                    <p className="text-xs text-slate-500 mt-1">{task.description}</p>
                  )}

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className={`badge text-xs ${statusCfg.bg} ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
                    {task.assignedTo && (
                      <span className="text-xs text-slate-600 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {getMemberName(task.assignedTo)}
                      </span>
                    )}
                    {task.dueDate && (
                      <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-slate-600'}`}>
                        <Calendar className="w-3 h-3" />
                        {task.dueDate}
                      </span>
                    )}
                  </div>
                </div>

                {/* Delete */}
                {userProfile?.role !== 'pharmacist' && (
                  deleteConfirm === task.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => { deleteTask(task.id); setDeleteConfirm(null) }}
                        className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-lg">تأكيد</button>
                      <button onClick={() => setDeleteConfirm(null)}
                        className="px-2 py-1 text-xs bg-slate-800 text-slate-400 rounded-lg">إلغاء</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(task.id)}
                      className="text-slate-700 hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create task modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">مهمة جديدة</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">عنوان المهمة *</label>
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="عنوان المهمة..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">الوصف</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="تفاصيل المهمة..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">تعيين إلى</label>
                  <select value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}>
                    <option value="">اختر صيدلاني</option>
                    {teamMembers.map((m) => (
                      <option key={m.uid} value={m.uid}>{m.displayName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">الأولوية</label>
                  <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">عالية</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">تاريخ الاستحقاق</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1 justify-center">إلغاء</button>
              <button onClick={handleCreate} disabled={!form.title || saving} className="btn-primary flex-1 justify-center">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                إنشاء المهمة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
