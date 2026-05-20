import { create } from 'zustand'
export const useApprovalStore = create(() => ({ overlay: {} }))
export const APPROVAL_STATUS = { PENDING:'pending', APPROVED:'approved', REJECTED:'rejected' }
