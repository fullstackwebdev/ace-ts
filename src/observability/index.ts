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
  isOpikAvailable,
  _shouldSkipOpik,
} from './opik-integration';

export { maybeTrack, trackRole, aceTrack } from './tracers';
