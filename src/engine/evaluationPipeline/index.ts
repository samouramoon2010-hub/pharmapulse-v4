// ============================================================
// Evaluation Pipeline — Public API
//
// Import from here, not from sub-modules directly.
//
// Production engine (v1): src/engine/evaluationEngine/evaluationEngine.ts
// Pipeline engine (v2):   this module.
//
// V2 Production Promotion Bundle (Phase D): this is production-connected.
// evaluationOrchestrationService.ts calls resolveEvaluationPipeline() +
// buildPipelineContext() + executePipeline() + pipelineResultToEvaluationResult()
// directly on the V2-official path (when getActiveEngine() resolves 'v2'),
// with automatic fallback to V1 if any step fails. It also calls
// runShadowEvaluation() on the V1-official path to run V2 in shadow.
// This comment previously said "NOT yet production-connected" — that was
// true when the pipeline module was first scaffolded but is no longer
// accurate.
// ============================================================

export type {
  EvaluationProcessorType,
  EvaluationPipelineContext,
  EvaluationPipelineStep,
  EvaluationPipelineResult,
  EvaluationProcessor,
  ProcessorTrace,
  ElementContext,
  BasketContext,
} from './types'

export { validatePipeline, executePipeline } from './pipelineExecutor'
export { buildLegacyPipeline, buildSmartsPipeline } from './pipelinePresets'
export { buildPipelineContext, extractCapConfig }   from './contextBuilder'
export { PROCESSOR_REGISTRY }                        from './processors'
export { pipelineResultToEvaluationResult }          from './pipelineAdapter'
export {
  resolveEvaluationPipeline,
  compareEvaluationResults,
  runShadowEvaluation,
} from './pipelineResolver'
export type {
  PipelineId,
  ResolvedPipeline,
  EvaluationDifference,
  EvaluationComparisonResult,
  ComparisonSeverity,
  ShadowEvaluationResult,
} from './pipelineResolver'
