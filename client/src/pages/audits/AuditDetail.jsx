import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, HelpCircle, Lock, ShieldAlert, ShieldX } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { Badge, Button, ConfirmDialog, Field, Modal, PageHeader, PageSpinner } from '../../components/ui';
import { AUDIT_STATUS, VERIFICATION } from '../../utils/constants';
import { fmtDate } from '../../utils/format';

const VERIFY_ACTIONS = [
  { value: 'VERIFIED', label: 'Verified', icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  { value: 'DAMAGED', label: 'Damaged', icon: ShieldAlert, cls: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { value: 'MISSING', label: 'Missing', icon: ShieldX, cls: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' },
];

function VerifyModal({ open, onClose, item, verification, auditId, onDone }) {
  const toast = useToast();
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.patch(`/audits/${auditId}/items/${item.id}`, { verification, remarks: remarks.trim() || null });
      toast.success(`${item.assetName} marked ${verification.toLowerCase()}`);
      setRemarks('');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Mark as ${verification?.toLowerCase()}`}
      subtitle={item ? `${item.assetName} (${item.assetTag})` : ''}>
      <Field label="Remarks" hint={verification === 'VERIFIED' ? 'optional' : 'recommended'}>
        <textarea className="input min-h-20" placeholder="Location, condition details…"
          value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={loading}>Confirm</Button>
      </div>
    </Modal>
  );
}

export default function AuditDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isManager } = useAuth();
  const toast = useToast();
  const { data: audit, loading, refetch } = useFetch(`/audits/${id}`);
  const [verifying, setVerifying] = useState(null); // { item, verification }
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [filter, setFilter] = useState('');

  if (loading) return <PageSpinner />;
  if (!audit) return null;

  const isAuditor = audit.assignedToId === user.id;
  const canVerify = (isAuditor || isManager) && audit.status !== 'CLOSED';
  const items = filter ? audit.items.filter((i) => i.verification === filter) : audit.items;
  const pendingCount = audit.items.filter((i) => i.verification === 'PENDING').length;
  const counts = ['VERIFIED', 'DAMAGED', 'MISSING', 'PENDING'].map((v) => ({
    v, n: audit.items.filter((i) => i.verification === v).length,
  }));

  const closeAudit = async () => {
    setClosing(true);
    try {
      const res = await api.post(`/audits/${id}/close`);
      const s = res.data.data;
      toast.success(`Audit closed — ${s.markedLost} asset(s) marked lost, ${s.markedDamaged} marked damaged`);
      setCloseConfirm(false);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClosing(false);
    }
  };

  return (
    <div>
      <button onClick={() => navigate('/audits')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> All audits
      </button>

      <PageHeader
        title={audit.name}
        subtitle={`Scope: ${audit.departmentName ?? 'All departments'}${audit.categoryName ? ` · ${audit.categoryName}` : ''} · Auditor: ${audit.assignedToName ?? '—'}${audit.dueDate ? ` · due ${fmtDate(audit.dueDate)}` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge meta={AUDIT_STATUS[audit.status]} />
            {isManager && audit.status !== 'CLOSED' && (
              <Button variant="danger" icon={Lock} onClick={() => setCloseConfirm(true)} disabled={pendingCount > 0}
                title={pendingCount > 0 ? `${pendingCount} items still pending` : undefined}>
                Close audit
              </Button>
            )}
          </div>
        }
      />

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setFilter('')}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${!filter ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
          All · {audit.items.length}
        </button>
        {counts.map(({ v, n }) => (
          <button key={v} onClick={() => setFilter(filter === v ? '' : v)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${filter === v ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
            {VERIFICATION[v].label} · {n}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Verification</th>
                <th className="px-4 py-3">Remarks</th>
                {canVerify && <th className="px-4 py-3 text-right">Verify</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="rise-in border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{item.assetName}</p>
                    <p className="text-xs text-slate-400">{item.assetTag} · {item.categoryName}{item.serialNumber ? ` · ${item.serialNumber}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{item.location ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{item.assetStatus.replaceAll('_', ' ').toLowerCase()}</td>
                  <td className="px-4 py-3">
                    <Badge meta={VERIFICATION[item.verification]} />
                    {item.verifiedByName && (
                      <p className="mt-1 text-[10px] text-slate-400">by {item.verifiedByName} · {fmtDate(item.verifiedAt)}</p>
                    )}
                  </td>
                  <td className="max-w-48 px-4 py-3">
                    <span className="block truncate text-xs text-slate-500" title={item.remarks}>{item.remarks ?? '—'}</span>
                  </td>
                  {canVerify && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {VERIFY_ACTIONS.map(({ value, label, icon: Icon, cls }) => (
                          <button key={value} title={label}
                            onClick={() => setVerifying({ item, verification: value })}
                            className={`rounded-lg border p-1.5 transition-colors ${item.verification === value ? cls : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}>
                            <Icon size={15} />
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  <HelpCircle size={20} className="mx-auto mb-2 text-slate-300" />
                  No items match this filter.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <VerifyModal
        open={!!verifying} onClose={() => setVerifying(null)}
        item={verifying?.item} verification={verifying?.verification} auditId={id} onDone={refetch}
      />
      <ConfirmDialog
        open={closeConfirm} onClose={() => setCloseConfirm(false)} onConfirm={closeAudit} loading={closing}
        title="Close this audit?"
        message="Closing is final. Assets confirmed missing will be marked LOST (their allocations closed), and damaged assets will have their condition updated. A discrepancy summary will be logged."
        confirmLabel="Close audit"
      />
    </div>
  );
}
