/**
 * ACE Observability Module
 *
 * Provides production-grade observability for ACE framework using Opik.
 * Replaces custom explainability implementation with industry-standard tracing.
 */

export {
  OpikIntegration,
  configureOpik,
  getIntegration,
  OPIK_AVAILABLE,
} from "./opik_integration.js";

export { aceTrack, trackRole, maybeTrack } from "./tracers.js";
