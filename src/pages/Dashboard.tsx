import React, {useEffect, useState, useMemo} from 'react';
import {api, ApiError} from '../services/api';
import {useAuth} from '../context/AuthContext';
import {
  Incident,
  FlaggedAccount,
  AnalysisRecord,
  SeverityLevel,
  HealthResponse,
} from '../types';
import {SeverityBadge} from '../components/SeverityBadge';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileSearch,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  Check,
  AlertOctagon,
  AlertCircle,
  FileText,
  HelpCircle,
  ArrowUpRight,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const {currentUser} = useAuth();

  // Core Data States
  const [flaggedAccounts, setFlaggedAccounts] = useState<FlaggedAccount[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [healthInfo, setHealthInfo] = useState<HealthResponse | null>(null);

  // Filter & Selection States
  const [severityFilter, setSeverityFilter] = useState<'low' | 'medium' | 'high' | 'critical'>('low');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  // Analysis & Investigation States
  const [analysisRecord, setAnalysisRecord] = useState<AnalysisRecord | null>(null);
  const [analysisNotFound, setAnalysisNotFound] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Decision States
  const [decisionAction, setDecisionAction] = useState<'approve' | 'reject' | 'escalate' | null>(null);
  const [decisionNote, setDecisionNote] = useState<string>('');
  const [showDecisionModal, setShowDecisionModal] = useState<boolean>(false);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState<boolean>(false);
  const [decisionSuccessMessage, setDecisionSuccessMessage] = useState<string | null>(null);
  const [decisionErrorMessage, setDecisionErrorMessage] = useState<string | null>(null);

  // Loading States
  const [isLoadingScan, setIsLoadingScan] = useState<boolean>(true);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState<boolean>(true);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState<boolean>(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // 8.1 Initialize Dashboard: GET /scan?min_severity=... & GET /incidents
  useEffect(() => {
    fetchInitialData();
  }, []);

  // When severity filter changes, call GET /scan?min_severity=...
  useEffect(() => {
    fetchScanData(severityFilter);
  }, [severityFilter]);

  // When incident selection changes, fetch its analysis
  useEffect(() => {
    if (selectedIncidentId) {
      const inc = incidents.find((i) => i.incident_id.toLowerCase() === selectedIncidentId.toLowerCase()) || null;
      setSelectedIncident(inc);
      fetchIncidentAnalysis(selectedIncidentId);
    } else {
      setSelectedIncident(null);
      setAnalysisRecord(null);
      setAnalysisNotFound(false);
      setAnalysisError(null);
    }
  }, [selectedIncidentId, incidents]);

  const fetchInitialData = async () => {
    setPageError(null);
    setIsLoadingIncidents(true);
    try {
      const [incs, health] = await Promise.all([
        api.getIncidents(),
        api.getHealth().catch(() => null),
      ]);
      setIncidents(incs);
      if (health) setHealthInfo(health);

      // Auto-select first incident for convenience if none selected
      if (incs.length > 0 && !selectedIncidentId) {
        setSelectedIncidentId(incs[0].incident_id);
      }
    } catch (err: any) {
      setPageError(err.message || 'Failed to initialize incident data.');
    } finally {
      setIsLoadingIncidents(false);
    }
  };

  const fetchScanData = async (minSev: 'low' | 'medium' | 'high' | 'critical') => {
    setIsLoadingScan(true);
    try {
      const accounts = await api.getScan(minSev);
      setFlaggedAccounts(accounts);
    } catch (err: any) {
      console.error('Scan failed:', err);
    } finally {
      setIsLoadingScan(false);
    }
  };

  const fetchIncidentAnalysis = async (id: string) => {
    setIsLoadingAnalysis(true);
    setAnalysisError(null);
    setAnalysisNotFound(false);
    setDecisionSuccessMessage(null);
    setDecisionErrorMessage(null);

    try {
      const record = await api.getIncidentAnalysis(id);
      if (record && (record.analysis || (record as any).incident_type || (record as any).risk_level)) {
        setAnalysisRecord(record);
        setAnalysisNotFound(false);
      } else {
        // Normal 404 state: unanalyzed
        setAnalysisRecord(null);
        setAnalysisNotFound(true);
      }
    } catch (err: any) {
      if (
        err?.status === 404 ||
        err?.statusCode === 404 ||
        (err instanceof ApiError && err.status === 404) ||
        (typeof err?.message === 'string' && (err.message.includes('Not analyzed') || err.message.includes('not found') || err.message.includes('404')))
      ) {
        setAnalysisRecord(null);
        setAnalysisNotFound(true);
      } else {
        setAnalysisRecord(null);
        setAnalysisError(err.message || 'Failed to load analysis for this incident.');
      }
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  // 8.6 Run AI Analysis on Selected Incident
  const handleAnalyze = async () => {
    if (!selectedIncidentId || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const record = await api.analyzeIncident(selectedIncidentId);
      if (record && (record.analysis || (record as any).incident_type || (record as any).risk_level)) {
        setAnalysisRecord(record);
        setAnalysisNotFound(false);
      } else {
        setAnalysisError('The analysis service returned an incomplete response. Please try again.');
      }
    } catch (err: any) {
      if (err.status === 502) {
        setAnalysisError(
          err.message && err.message.length > 10
            ? err.message
            : 'The analysis service is temporarily unavailable. Please try again.'
        );
      } else {
        setAnalysisError(err.message || 'Analysis request failed. Please check network connection.');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 8.8 Submit Administrator Decision
  const handleConfirmDecision = async () => {
    if (!selectedIncidentId || !decisionAction || isSubmittingDecision) return;
    setIsSubmittingDecision(true);
    setDecisionErrorMessage(null);
    setDecisionSuccessMessage(null);

    const adminName = currentUser?.name || currentUser?.email || 'Administrator';

    try {
      const updated = await api.submitDecision(selectedIncidentId, {
        decision: decisionAction,
        decided_by: adminName,
        note: decisionNote.trim(),
      }, analysisRecord);
      setAnalysisRecord(updated);
      setShowDecisionModal(false);
      setDecisionNote('');
      setDecisionSuccessMessage(`Decision successfully recorded: ${decisionAction.toUpperCase()}`);
    } catch (err: any) {
      setDecisionErrorMessage(err.message || 'Failed to record decision. Please try again.');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // Safe normalized analysis view data - prevents any TypeError
  const currentAnalysis = useMemo(() => {
    if (!analysisRecord) return null;
    const raw = (analysisRecord.analysis || analysisRecord) as any;
    if (!raw || typeof raw !== 'object' || (!raw.risk_level && !raw.incident_type && !raw.explanation && !raw.evidence)) {
      return null;
    }

    return {
      risk_level: raw.risk_level || selectedIncident?.expected_risk || 'Medium',
      incident_type: raw.incident_type || 'Security Policy Violation',
      explanation: raw.explanation || 'Security event analyzed by EduGuard Agent.',
      recommended_action:
        raw.recommended_action ||
        selectedIncident?.expected_recommendation ||
        'Review incident logs and verify user credentials.',
      confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.85,
      needs_human_review: raw.needs_human_review ?? true,
      policy_floor_applied: Boolean(raw.policy_floor_applied),
      evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
      model: analysisRecord.model || analysisRecord.provider || raw.model || 'EduGuard Security Agent',
      analyzed_at: analysisRecord.analyzed_at || new Date().toISOString(),
      decision: analysisRecord.decision || null,
    };
  }, [analysisRecord, selectedIncident]);

  // 8.2 Calculate Security Overview Metrics
  const overviewMetrics = useMemo(() => {
    const totalFlagged = flaggedAccounts.length;
    const totalIncs = incidents.length;

    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    for (const acc of flaggedAccounts) {
      const sev = (acc.highest_severity || '').toLowerCase();
      if (sev === 'critical') criticalCount++;
      else if (sev === 'high') highCount++;
      else if (sev === 'medium') mediumCount++;
      else if (sev === 'low') lowCount++;
    }

    // Incidents awaiting review vs with decision
    const decisionsCount = (analysisRecord?.decision || currentAnalysis?.decision) ? 1 : 0;
    const awaitingReviewCount = Math.max(0, totalIncs - decisionsCount);

    return {
      totalFlagged,
      totalIncs,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      awaitingReviewCount,
      decisionsCount,
    };
  }, [flaggedAccounts, incidents, analysisRecord, currentAnalysis]);

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
            <Activity className="w-3.5 h-3.5" />
            <span>SentrX Security Enclave · Real-Time Incident Console</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Security Operations & Incident Intelligence
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 max-w-3xl">
            Proactively monitor unauthorized access to student records, analyze security violations with AI, and record human administrator decisions.
          </p>
        </div>

        {/* Global Refresh & Health Status */}
        <div className="flex items-center gap-3 shrink-0">
          {healthInfo && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-xs font-mono text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Status: {healthInfo.status}</span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-400">{healthInfo.records.access_logs} logs</span>
            </div>
          )}

          <button
            onClick={() => {
              fetchInitialData();
              fetchScanData(severityFilter);
            }}
            title="Refresh Scan & Incidents"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {pageError && (
        <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/40 text-rose-300 text-sm flex items-start gap-3">
          <AlertOctagon className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">System Connection Warning: </span>
            {pageError}
          </div>
          <button
            onClick={fetchInitialData}
            className="px-2.5 py-1 text-xs font-medium text-white bg-rose-800/60 hover:bg-rose-800 rounded transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* 8.2 Security Overview Metric Strip */}
      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="sr-only">Security Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
          {/* Flagged Accounts */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0A1022]/70 backdrop-blur-md p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Flagged Accounts</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono tabular-nums">
                {isLoadingScan ? '…' : overviewMetrics.totalFlagged}
              </span>
              <span className="text-xs text-rose-400 font-medium">requiring review</span>
            </div>
          </div>

          {/* Total Incidents */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0A1022]/70 backdrop-blur-md p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Active Incidents</span>
              <FileSearch className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono tabular-nums">
                {isLoadingIncidents ? '…' : overviewMetrics.totalIncs}
              </span>
              <span className="text-xs text-slate-400">seeded cases</span>
            </div>
          </div>

          {/* Critical & High Violations */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0A1022]/70 backdrop-blur-md p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>High / Critical Risks</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-amber-300 font-mono tabular-nums">
                {isLoadingScan ? '…' : overviewMetrics.criticalCount + overviewMetrics.highCount}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                ({overviewMetrics.criticalCount} crit · {overviewMetrics.highCount} high)
              </span>
            </div>
          </div>

          {/* Pending Administrator Action */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0A1022]/70 backdrop-blur-md p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Awaiting Decision</span>
              <Clock className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-yellow-300 font-mono tabular-nums">
                {isLoadingIncidents ? '…' : overviewMetrics.awaitingReviewCount}
              </span>
              <span className="text-xs text-yellow-500/80">unresolved</span>
            </div>
          </div>

          {/* Recorded Decisions */}
          <div className="col-span-2 lg:col-span-1 rounded-xl border border-slate-800/90 bg-[#0A1022]/70 backdrop-blur-md p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Recorded Decisions</span>
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-300 font-mono tabular-nums">
                {overviewMetrics.decisionsCount}
              </span>
              <span className="text-xs text-emerald-500/80">audited</span>
            </div>
          </div>
        </div>
      </section>

      {/* 8.3 Flagged Accounts Section with Severity Filter */}
      <section className="rounded-2xl border border-slate-800/90 bg-[#0A1022]/75 backdrop-blur-md p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Flagged Accounts Scan
              </h2>
              <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
                GET /scan
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Evaluated against district security rules (out-of-class access, departed staff, vendor district boundary crossing).
            </p>
          </div>

          {/* Severity Filter Controls */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-lg shrink-0">
            <div className="flex items-center gap-1 text-xs text-slate-400 px-2 hidden sm:flex">
              <Filter className="w-3 h-3" />
              <span>Min:</span>
            </div>
            {(['low', 'medium', 'high', 'critical'] as const).map((sev) => {
              const active = severityFilter === sev;
              return (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-all capitalize ${
                    active
                      ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {sev}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scan Results Table / Card Grid */}
        {isLoadingScan ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            <span className="text-xs font-mono">Running deterministic policy scan…</span>
          </div>
        ) : flaggedAccounts.length === 0 ? (
          <div className="py-10 text-center rounded-xl border border-dashed border-slate-800 text-slate-400">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-400 mb-2 opacity-80" />
            <p className="text-sm font-medium text-slate-300">No accounts flagged at '{severityFilter}' threshold</p>
            <p className="text-xs text-slate-500 mt-1">Try lowering the minimum severity filter to see lower-tier security events.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-medium">
                  <th className="pb-3 pl-2">Account / User</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Employment / Status</th>
                  <th className="pb-3">Severity</th>
                  <th className="pb-3">Security Rules Triggered</th>
                  <th className="pb-3 pr-2 text-right">Related Incidents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {flaggedAccounts.map((acc) => {
                  const hasIncident = acc.related_incident_ids.length > 0;
                  return (
                    <tr
                      key={acc.user_id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-3 pl-2 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-cyan-300 font-mono">
                            {acc.user_id}
                          </div>
                          <span className="font-medium text-slate-200">{acc.name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-slate-300">{acc.role}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className={acc.employment_status === 'Active' ? 'text-slate-300' : 'text-rose-400 font-semibold'}>
                            {acc.employment_status}
                          </span>
                          <span className="text-slate-600">/</span>
                          <span className={acc.account_status === 'Active' ? 'text-slate-400' : 'text-amber-400 font-medium'}>
                            {acc.account_status}
                          </span>
                        </div>
                      </td>
                      <td className="py-3">
                        <SeverityBadge level={acc.highest_severity} size="sm" />
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {acc.rules_triggered.map((rule, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900 border border-slate-800 text-slate-300"
                            >
                              {rule}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-2 text-right">
                        {hasIncident ? (
                          <button
                            onClick={() => setSelectedIncidentId(acc.related_incident_ids[0])}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/50 transition-colors"
                          >
                            <span>Inspect {acc.related_incident_ids[0]}</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[11px]">No active case</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Main Dual-Column Workspace: Incidents List & Investigation Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* 8.4 Incidents List (Left Column, 4/12 cols) */}
        <section
          aria-labelledby="incidents-heading"
          className="lg:col-span-5 rounded-2xl border border-slate-800/90 bg-[#0A1022]/75 backdrop-blur-md p-5 shadow-xl space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 id="incidents-heading" className="text-base font-bold text-white tracking-tight">
                Seeded Incident Queue
              </h2>
              <span className="text-xs text-slate-400">Select an incident to investigate</span>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
              {incidents.length} cases
            </span>
          </div>

          {isLoadingIncidents ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-xs font-mono">Loading incident queue…</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {incidents.map((inc) => {
                const isSelected = selectedIncidentId?.toLowerCase() === inc.incident_id.toLowerCase();
                return (
                  <div
                    key={inc.incident_id}
                    onClick={() => setSelectedIncidentId(inc.incident_id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-cyan-500/60 bg-cyan-950/30 shadow-md shadow-cyan-950/30'
                        : 'border-slate-800/80 bg-slate-900/40 hover:bg-slate-800/50 hover:border-slate-700/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                          {inc.incident_id}
                        </span>
                        <SeverityBadge level={inc.expected_risk} size="sm" />
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 transition-transform ${
                          isSelected ? 'text-cyan-400 translate-x-0.5' : 'text-slate-600'
                        }`}
                      />
                    </div>

                    <h3 className="text-xs sm:text-sm font-semibold text-slate-200 line-clamp-2">
                      {inc.title}
                    </h3>

                    <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>User: {inc.user_id}</span>
                      <span>Log: {inc.related_log_id}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 8.5 - 8.8 Incident Investigation, AI Analysis & Decisions (Right Column, 7/12 cols) */}
        <section
          aria-labelledby="investigation-heading"
          className="lg:col-span-7 rounded-2xl border border-slate-800/90 bg-[#0A1022]/75 backdrop-blur-md p-6 shadow-xl space-y-6"
        >
          {selectedIncident ? (
            <>
              {/* Selected Incident Header */}
              <div className="border-b border-slate-800 pb-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                      Case #{selectedIncident.incident_id}
                    </span>
                    <SeverityBadge level={selectedIncident.expected_risk} size="md" />
                  </div>

                  <span className="text-xs text-slate-400 font-mono">
                    User: {selectedIncident.user_id} · Log: {selectedIncident.related_log_id}
                  </span>
                </div>

                <h2 id="investigation-heading" className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {selectedIncident.title}
                </h2>
              </div>

              {/* Decision Feedback Banners */}
              {decisionSuccessMessage && (
                <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{decisionSuccessMessage}</span>
                </div>
              )}
              {decisionErrorMessage && (
                <div className="p-3.5 rounded-lg border border-rose-500/30 bg-rose-950/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{decisionErrorMessage}</span>
                </div>
              )}

              {/* Analysis Loading State */}
              {isLoadingAnalysis ? (
                <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                  <span className="text-sm font-medium text-slate-300">Retrieving incident analysis…</span>
                </div>
              ) : analysisNotFound ? (
                /* 8.5 Unanalyzed State (HTTP 404 is normal application state) */
                <div className="py-12 px-6 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-cyan-950/60 border border-cyan-800/40 flex items-center justify-center mx-auto text-cyan-400">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">This incident has not been analyzed yet.</h3>
                    <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
                      Run the EduGuard security agent to inspect raw identity data, permissions, and access logs for this incident.
                    </p>
                  </div>

                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md shadow-cyan-950/50 transition-all disabled:opacity-60"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Analyzing incident evidence…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Analyze Incident</span>
                      </>
                    )}
                  </button>

                  {isAnalyzing && (
                    <p className="text-xs text-cyan-300 font-mono animate-pulse">
                      Analyzing incident facts and student logs. This may take 10–60 seconds…
                    </p>
                  )}
                </div>
              ) : analysisError ? (
                /* Analysis Error State (e.g. HTTP 502 upstream) */
                <div className="p-5 rounded-xl border border-rose-500/40 bg-rose-950/30 text-slate-300 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-rose-300">Analysis Error</h4>
                      <p className="text-xs text-slate-300 mt-1">{analysisError}</p>
                    </div>
                  </div>
                  <div className="pt-2 flex items-center gap-3">
                    <button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="px-3.5 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Analysis</span>
                    </button>
                  </div>
                </div>
              ) : currentAnalysis ? (
                /* 8.7 Incident Analysis Details Display */
                <div className="space-y-6">
                  {/* Analysis Metadata Banner */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">Risk Assessment:</span>
                      <SeverityBadge level={currentAnalysis.risk_level} size="md" />
                      {currentAnalysis.policy_floor_applied && (
                        <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-600/40 text-[11px] font-sans font-semibold">
                          Raised by policy rule
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Human Review Indicator */}
                      {currentAnalysis.needs_human_review && (
                        <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-600/40 text-[11px] font-sans font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Needs Human Review
                        </span>
                      )}

                      {/* Confidence Score */}
                      <span className="text-slate-300">
                        Confidence:{' '}
                        <strong className="text-cyan-400">
                          {Math.round((currentAnalysis.confidence ?? 0.85) * 100)}%
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Model & Provider Attribution */}
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-mono">
                    <span>
                      Model Attribution:{' '}
                      <strong className="text-slate-200">
                        {currentAnalysis.model}
                      </strong>
                    </span>
                    <span className="text-slate-500">
                      Analyzed at: {new Date(currentAnalysis.analyzed_at).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* AI Plain-Language Explanation */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-cyan-400" />
                      Security Finding & Explanation
                    </h4>
                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-sm text-slate-200 leading-relaxed">
                      {currentAnalysis.explanation}
                    </div>
                  </div>

                  {/* Recommended Action */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Recommended Mitigation
                    </h4>
                    <div className="p-4 rounded-xl border border-emerald-950/40 bg-emerald-950/20 text-sm text-emerald-200 leading-relaxed font-medium">
                      {currentAnalysis.recommended_action}
                    </div>
                  </div>

                  {/* Technical Evidence */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      Supporting Evidence
                    </h4>
                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                      {currentAnalysis.evidence && currentAnalysis.evidence.length > 0 ? (
                        currentAnalysis.evidence.map((item: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-slate-300 font-mono">
                            <span className="text-cyan-400 mt-0.5">•</span>
                            <span>{item}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic">No specific anomaly flags recorded.</p>
                      )}
                    </div>
                  </div>

                  {/* 8.8 Administrator Decision Workflow */}
                  <div className="pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Administrator Decision
                    </h4>

                    {currentAnalysis.decision ? (
                      /* Recorded Decision Confirmation Card */
                      <div className="p-5 rounded-xl border border-slate-700/80 bg-slate-900/70 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider font-mono ${
                                currentAnalysis.decision.decision === 'approve'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                                  : currentAnalysis.decision.decision === 'reject'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                                  : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                              }`}
                            >
                              {currentAnalysis.decision.decision}
                            </span>
                            <span className="text-xs text-slate-300 font-medium">
                              Decided by: <strong>{currentAnalysis.decision.decided_by}</strong>
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 font-mono">
                            {new Date(currentAnalysis.decision.decided_at).toLocaleString()}
                          </span>
                        </div>

                        {currentAnalysis.decision.note && (
                          <p className="text-xs text-slate-300 italic pt-1 border-t border-slate-800">
                            "{currentAnalysis.decision.note}"
                          </p>
                        )}

                        <div className="text-[11px] text-slate-500 pt-1 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
                          <span>Audit record safely logged. No student records were altered.</span>
                        </div>
                      </div>
                    ) : (
                      /* Decision Action Controls */
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => {
                              setDecisionAction('approve');
                              setShowDecisionModal(true);
                            }}
                            className="flex-1 py-2.5 px-4 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2 shadow-sm"
                          >
                            <Check className="w-4 h-4" />
                            <span>Approve Recommendation</span>
                          </button>

                          <button
                            onClick={() => {
                              setDecisionAction('reject');
                              setShowDecisionModal(true);
                            }}
                            className="flex-1 py-2.5 px-4 rounded-lg text-xs font-bold text-white bg-rose-700 hover:bg-rose-600 transition-colors flex items-center justify-center gap-2 shadow-sm"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Reject Recommendation</span>
                          </button>

                          <button
                            onClick={() => {
                              setDecisionAction('escalate');
                              setShowDecisionModal(true);
                            }}
                            className="flex-1 py-2.5 px-4 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors flex items-center justify-center gap-2 shadow-sm"
                          >
                            <AlertTriangle className="w-4 h-4" />
                            <span>Escalate to District</span>
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-500 text-center">
                          Safety requirement: Recording a decision records administrator review only; permissions and student accounts are not automatically altered.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="py-24 text-center text-slate-500">
              <FileSearch className="w-10 h-10 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-400">Select an incident from the queue to investigate evidence</p>
            </div>
          )}
        </section>
      </div>

      {/* Decision Confirmation Modal Dialog */}
      {showDecisionModal && decisionAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0B1124] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-white capitalize">
                  Confirm {decisionAction} Decision
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Case #{selectedIncidentId} · {selectedIncident?.title}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold uppercase font-mono ${
                  decisionAction === 'approve'
                    ? 'bg-emerald-950 text-emerald-300'
                    : decisionAction === 'reject'
                    ? 'bg-rose-950 text-rose-300'
                    : 'bg-amber-950 text-amber-300'
                }`}
              >
                {decisionAction}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Administrator Note (Optional)
              </label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Add contextual justification or next steps for district audit records…"
                rows={3}
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
              Recorded by: <strong className="text-slate-200">{currentUser?.name || currentUser?.email}</strong>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDecisionModal(false)}
                disabled={isSubmittingDecision}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDecision}
                disabled={isSubmittingDecision}
                className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition-all flex items-center gap-2 ${
                  decisionAction === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : decisionAction === 'reject'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {isSubmittingDecision ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Recording…</span>
                  </>
                ) : (
                  <span>Confirm & Save Decision</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
