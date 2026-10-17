import { useState } from 'react';
import { CalendarDays, List, ChevronDown } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import type { Stop } from '@/data/trucks';
import { fmtRange } from '@/data/trucks';
import { UPCOMING_LIMIT, chicagoDay, calendarDate } from '@/data/public-schedule';

export function PublicTruckSchedule({ stops, name }: { stops: Stop[]; name: string }) {
  const [mode, setMode] = useState<'list'|'calendar'>('list');
  const [more, setMore] = useState(false);
  const [date, setDate] = useState<Date>();
  const visible = more ? stops : stops.slice(0, UPCOMING_LIMIT);
  const selectedDay = date ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` : null;
  const daily = selectedDay ? stops.filter(s => chicagoDay(s.starts_at) === selectedDay) : [];
  function entries(items: Stop[]) {
    return <ul className="divide-y divide-border">{items.map(s => <li key={s.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
      <span className="font-semibold">{new Date(s.starts_at).toLocaleDateString('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric'})}</span>
      <div className="min-w-0"><p className="break-words font-medium">{s.venue_name}, {s.city}</p><p className="text-muted-foreground">{fmtRange(s)} · Central</p>{s.address && <p className="break-words text-muted-foreground">{s.address}</p>}</div>
    </li>)}</ul>;
  }
  return <section className="space-y-4 border-y border-border py-5" aria-labelledby="schedule-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="schedule-heading" className="text-xl font-bold">Upcoming stops for {name}</h2>
      <div className="flex gap-1" role="group" aria-label="Schedule view"><Button variant={mode==='list'?'secondary':'ghost'} aria-pressed={mode==='list'} onClick={()=>setMode('list')}><List className="h-4 w-4" />List</Button><Button variant={mode==='calendar'?'secondary':'ghost'} aria-pressed={mode==='calendar'} onClick={()=>setMode('calendar')}><CalendarDays className="h-4 w-4" />Calendar</Button></div>
    </div>
    {mode==='list' ? <>{stops.length===0 && <p className="text-sm text-muted-foreground">No stops scheduled.</p>}{entries(visible)}{stops.length>UPCOMING_LIMIT && <Button variant="outline" onClick={()=>setMore(!more)}><ChevronDown className="h-4 w-4" />{more?'Show next five':`View all ${stops.length} stops`}</Button>}</> :
      <div className="grid items-start gap-5 md:grid-cols-[auto_minmax(0,1fr)]"><Calendar mode="single" selected={date} onSelect={setDate} defaultMonth={stops[0] ? calendarDate(stops[0].starts_at) : new Date()} modifiers={{scheduled:stops.map(s=>calendarDate(s.starts_at))}} modifiersClassNames={{scheduled:'bg-accent font-bold text-accent-foreground'}} />
        <div>{date ? <><h3 className="font-semibold">{date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</h3>{daily.length ? entries(daily) : <p className="py-3 text-sm text-muted-foreground">No stops scheduled.</p>}</> : entries(visible)}</div>
      </div>}
  </section>;
}