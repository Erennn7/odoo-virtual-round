import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarClock, CalendarRange, ChevronLeft, ChevronRight, Clock, MapPin, Plus, X } from 'lucide-react';
import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Button, EmptyState, Field, Modal, PageHeader, PageSpinner } from '../components/ui';
import { BOOKING_STATUS } from '../utils/constants';
import { fmtDateTime, fmtTime } from '../utils/format';

/** Create / reschedule a booking with client-side overlap hinting. */
function BookingModal({ open, onClose, onDone, resources, booking = null, presetResourceId = null }) {
  const toast = useToast();
  const editing = !!booking;
  const [form, setForm] = useState({ assetId: '', purpose: '', date: '', start: '', end: '', attendees: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (booking) {
      const s = new Date(booking.startTime);
      const e = new Date(booking.endTime);
      setForm({
        assetId: booking.assetId, purpose: booking.purpose,
        date: format(s, 'yyyy-MM-dd'), start: format(s, 'HH:mm'), end: format(e, 'HH:mm'),
        attendees: booking.attendees ?? '',
      });
    } else {
      setForm({ assetId: presetResourceId ?? '', purpose: '', date: format(new Date(), 'yyyy-MM-dd'), start: '', end: '', attendees: '' });
    }
  }, [open, booking, presetResourceId]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.assetId) errs.assetId = 'Select a resource';
    if (form.purpose.trim().length < 3) errs.purpose = 'Purpose is required';
    if (!form.date || !form.start || !form.end) errs.time = 'Pick the date and time range';
    else if (form.end <= form.start) errs.time = 'End time must be after start time';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const startTime = new Date(`${form.date}T${form.start}`);
    const endTime = new Date(`${form.date}T${form.end}`);
    setLoading(true);
    try {
      if (editing) {
        await api.patch(`/bookings/${booking.id}`, { startTime, endTime, purpose: form.purpose.trim() });
        toast.success('Booking rescheduled');
      } else {
        await api.post('/bookings', {
          assetId: form.assetId, purpose: form.purpose.trim(), startTime, endTime,
          attendees: form.attendees ? Number(form.attendees) : null,
        });
        toast.success('Booking confirmed');
      }
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Reschedule booking' : 'Book a resource'}
      subtitle="Overlapping bookings are rejected automatically; back-to-back is fine.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Resource" error={errors.assetId} required>
          <select className={`input ${errors.assetId ? 'input-error' : ''}`} value={form.assetId} disabled={editing}
            onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
            <option value="">Select a resource…</option>
            {resources.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.categoryName}</option>)}
          </select>
        </Field>
        <Field label="Purpose" error={errors.purpose} required>
          <input className={`input ${errors.purpose ? 'input-error' : ''}`} placeholder="e.g. Sprint planning"
            value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date" required>
            <input type="date" min={format(new Date(), 'yyyy-MM-dd')} className="input" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="From" required>
            <input type="time" className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </Field>
          <Field label="To" required>
            <input type="time" className="input" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </Field>
        </div>
        {errors.time && <p className="text-xs text-red-600">{errors.time}</p>}
        <Field label="Attendees" hint="optional">
          <input type="number" min="1" className="input" placeholder="e.g. 8" value={form.attendees}
            onChange={(e) => setForm({ ...form, attendees: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} icon={CalendarClock}>{editing ? 'Reschedule' : 'Confirm booking'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Week strip calendar for one resource. */
function ResourceCalendar({ resource, onBook }) {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => {
    setLoading(true);
    api.get('/bookings', {
      params: { assetId: resource.id, from: weekStart.toISOString(), to: addDays(weekStart, 7).toISOString(), limit: 100 },
    })
      .then((r) => setBookings(r.data.data.filter((b) => b.status !== 'CANCELLED')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [resource.id, weekStart]);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{resource.name}</h3>
          <p className="inline-flex items-center gap-1 text-xs text-slate-400">
            <MapPin size={11} /> {resource.location ?? 'No location'} · {resource.categoryName}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => setWeekStart((w) => addDays(w, -7))} />
          <span className="min-w-36 text-center text-xs font-medium text-slate-500">
            {format(weekStart, 'dd MMM')} – {format(addDays(weekStart, 6), 'dd MMM yyyy')}
          </span>
          <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => setWeekStart((w) => addDays(w, 7))} />
          <Button size="sm" icon={Plus} onClick={() => onBook(resource.id)}>Book</Button>
        </div>
      </div>

      <div className={`mt-4 grid grid-cols-7 gap-1.5 ${loading ? 'opacity-50' : ''} transition-opacity`}>
        {days.map((day) => {
          const dayBookings = bookings
            .filter((b) => isSameDay(new Date(b.startTime), day))
            .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
          const isToday = isSameDay(day, new Date());
          return (
            <div key={day.toISOString()} className={`min-h-24 rounded-lg border p-1.5 ${isToday ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-100 bg-slate-50/50'}`}>
              <p className={`text-center text-[10px] font-semibold uppercase ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                {format(day, 'EEE d')}
              </p>
              <div className="mt-1 space-y-1">
                {dayBookings.map((b) => (
                  <div key={b.id} title={`${b.purpose} — ${b.bookedByName}`}
                    className={`truncate rounded px-1.5 py-1 text-[10px] font-medium leading-tight ${
                      b.status === 'ONGOING' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                    {fmtTime(b.startTime)} {b.purpose}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Bookings() {
  const { isManager, user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [resources, setResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [myBookings, setMyBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(params.get('new') === 'true' ? { presetResourceId: null } : null);
  const [rescheduling, setRescheduling] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const loadAll = () => {
    Promise.all([
      api.get('/bookings/resources'),
      api.get('/bookings', { params: { limit: 50, mine: isManager ? undefined : 'true' } }),
    ])
      .then(([r, b]) => {
        setResources(r.data.data);
        setSelectedResource((prev) => prev ?? r.data.data[0] ?? null);
        setMyBookings(b.data.data);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelBooking = async () => {
    try {
      await api.post(`/bookings/${cancelling.id}/cancel`, { reason: cancelReason.trim() || null });
      toast.info('Booking cancelled');
      setCancelling(null);
      setCancelReason('');
      loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title="Resource Booking"
        subtitle="Reserve meeting rooms, vehicles and shared equipment. Conflicts are blocked automatically."
        actions={<Button icon={Plus} onClick={() => setModal({ presetResourceId: selectedResource?.id ?? null })}>New booking</Button>}
      />

      {/* Resource picker */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {resources.map((r) => (
          <button key={r.id} onClick={() => setSelectedResource(r)}
            className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition-all ${
              selectedResource?.id === r.id
                ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}>
            <p className={`text-sm font-medium ${selectedResource?.id === r.id ? 'text-indigo-700' : 'text-slate-700'}`}>{r.name}</p>
            <p className="text-[11px] text-slate-400">{r.categoryName} · {r.upcomingCount} upcoming</p>
          </button>
        ))}
        {resources.length === 0 && (
          <p className="text-sm text-slate-400">No bookable resources yet. Mark assets as “bookable” to enable reservations.</p>
        )}
      </div>

      {selectedResource && (
        <ResourceCalendar resource={selectedResource} onBook={(id) => setModal({ presetResourceId: id })} />
      )}

      {/* Booking list */}
      <div className="mt-6 rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CalendarRange size={15} className="text-slate-400" /> {isManager ? 'All bookings' : 'My bookings'}
          </h3>
        </div>
        {myBookings.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No bookings yet" message="Bookings you create will appear here with live status." />
        ) : (
          <div className="divide-y divide-slate-50">
            {myBookings.map((b, i) => {
              const mine = b.bookedById === user.id;
              const canManage = mine || isManager;
              return (
                <motion.div key={b.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {b.assetName} <span className="font-normal text-slate-400">· {b.purpose}</span>
                    </p>
                    <p className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Clock size={11} /> {fmtDateTime(b.startTime)} → {fmtTime(b.endTime)}
                      {!mine && <> · booked by {b.bookedByName}</>}
                    </p>
                  </div>
                  <Badge meta={BOOKING_STATUS[b.status]} />
                  {canManage && b.status === 'UPCOMING' && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => setRescheduling(b)}>Reschedule</Button>
                      <Button size="sm" variant="ghost" icon={X} onClick={() => setCancelling(b)} />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <BookingModal
        open={!!modal} onClose={() => setModal(null)} onDone={loadAll}
        resources={resources} presetResourceId={modal?.presetResourceId}
      />
      <BookingModal
        open={!!rescheduling} onClose={() => setRescheduling(null)} onDone={loadAll}
        resources={resources} booking={rescheduling}
      />
      <Modal open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel booking"
        subtitle={cancelling ? `${cancelling.assetName} · ${fmtDateTime(cancelling.startTime)}` : ''}>
        <Field label="Reason" hint="optional">
          <textarea className="input min-h-16" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelling(null)}>Keep booking</Button>
          <Button variant="danger" onClick={cancelBooking}>Cancel booking</Button>
        </div>
      </Modal>
    </div>
  );
}
