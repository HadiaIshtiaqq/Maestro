import type { LiveIncident, ResourceMap } from '../hooks/useLiveIncidents';
import { MOCK_INCIDENT_FIXTURES, MOCK_RESOURCE_FIXTURES } from '../../shared/mockIncidents';

export const MOCK_INCIDENTS: LiveIncident[] = MOCK_INCIDENT_FIXTURES as LiveIncident[];
export const MOCK_RESOURCES: ResourceMap = MOCK_RESOURCE_FIXTURES;
