import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NeonButton, SectionHeader } from '../components/CyberBushido'
import { learningCall } from '../services/learning'

interface ChampionshipInfo {
  id: string
  name: string
  status: string
  min_belt: string
  max_age: number
  registration_opens_at: string
  registration_closes_at: string
  questions_per_match: number
  time_limit_easy_seconds: number
  time_limit_medium_seconds: number
  time_limit_hard_seconds: number
  rules_text: string | null
}

interface MyMatch {
  id: string
  round: number
  scheduled_at: string
  window_closes_at: string
  status: string
  is_bye: boolean
  winner_id: string | null
  my_attempt_done: boolean
}

interface ChampionshipStatus {
  championship: ChampionshipInfo | null
  registered?: boolean
  my_match?: MyMatch | null
}

const BELT_LABEL: Record<string, string> = {
  white: 'blanco', yellow: 'amarillo', orange: 'naranja', green: 'verde', blue: 'azul', brown: 'marrón', black: 'negro',
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es-EC', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Guayaquil' }) + ' (hora de Ecuador)'
}

export function ChampionshipPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<ChampionshipStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState('')
  const [justRegistered, setJustRegistered] = useState(false)
  const confirmRef = useRef<HTMLElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  const load = () => {
    setLoading(true)
    setError('')
    learningCall<ChampionshipStatus>('get_my_championship_status')
      .then((d) => setData(d))
      .catch(() => setError('No pudimos cargar el campeonato. Revisa tu conexión y vuelve a intentar.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])
  useEffect(() => {
    // After enrolling, the form is replaced by the confirmation: move focus there so it is announced.
    if (justRegistered && data?.registered) confirmRef.current?.focus()
  }, [justRegistered, data?.registered])

  const handleRegister = async () => {
    if (!data?.championship || !birthdate) return
    setRegistering(true)
    setRegisterError('')
    try {
      await learningCall('register_for_championship', { p_championship_id: data.championship.id, p_birthdate: birthdate })
      setJustRegistered(true)
      load()
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : 'No se pudo completar la inscripción.')
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="learning-page champ-page">
      <SectionHeader eyebrow="TORNEO" title="Campeonato" kanji="優" />

      {loading && <p role="status">Cargando…</p>}
      {error && <div role="alert" className="glass-panel"><p>{error}</p><NeonButton color="cyan" variant="outline" onClick={load}>Volver a intentar</NeonButton></div>}

      {!loading && !error && !data?.championship && (
        <div className="glass-panel"><p>No hay un campeonato activo en este momento. Vuelve pronto.</p></div>
      )}

      {!loading && !error && data?.championship && (
        <>
          <section className="glass-panel">
            <h2>{data.championship.name}</h2>
            <p>
              Participan cinturones <strong>{BELT_LABEL[data.championship.min_belt] ?? data.championship.min_belt}</strong> de hasta{' '}
              <strong>{data.championship.max_age} años</strong> al momento de inscribirse. Cada combate consiste en{' '}
              <strong>{data.championship.questions_per_match} preguntas</strong>, respondidas una por una con un límite de tiempo:{' '}
              {data.championship.time_limit_easy_seconds} s (fácil), {data.championship.time_limit_medium_seconds} s (media),{' '}
              {data.championship.time_limit_hard_seconds} s (difícil). En la ronda 1 el sistema sortea los combates y te avisa por correo la fecha y hora.
            </p>
            {data.championship.rules_text && <p>{data.championship.rules_text}</p>}
            <p className="muted">
              Inscripciones: {fmt(data.championship.registration_opens_at)} — {fmt(data.championship.registration_closes_at)}
            </p>
          </section>

          {!data.registered && (
            <section className="glass-panel">
              {data.championship.status !== 'registration_open' ? (
                <p>Las inscripciones no están abiertas en este momento.</p>
              ) : (
                <>
                  <h3>Inscribirme</h3>
                  <label className="champ-field">
                    Fecha de nacimiento
                    <input type="date" required min="1900-01-01" max={today} autoComplete="bday" aria-describedby="champ-birth-help"
                      value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
                  </label>
                  <p id="champ-birth-help" className="muted">Solo la usamos para comprobar el límite de edad; no se muestra a otros participantes.</p>
                  {registerError && <p role="alert">{registerError}</p>}
                  <button type="button" className="cinema-button" disabled={registering || !birthdate} onClick={() => void handleRegister()}>
                    {registering ? 'Inscribiendo…' : 'Inscribirme'}
                  </button>
                </>
              )}
            </section>
          )}

          {data.registered && !data.my_match && (
            <section className="glass-panel" ref={confirmRef} tabIndex={-1} role="status"><p>Ya estás inscrito. Te avisaremos por correo cuando se sortee la ronda 1.</p></section>
          )}

          {data.registered && data.my_match && (
            <section className="glass-panel">
              <h3>Ronda {data.my_match.round}</h3>
              {data.my_match.is_bye ? (
                <p>Tuviste un pase directo (bye) esta ronda: avanzas automáticamente a la siguiente.</p>
              ) : data.my_match.status === 'completed' ? (
                <p>Combate completado. {data.my_match.winner_id ? 'Resultado registrado.' : ''}</p>
              ) : data.my_match.my_attempt_done ? (
                <p>Ya completaste tu combate. Esperando a tu oponente.</p>
              ) : (
                <>
                  <p>Tu combate: {fmt(data.my_match.scheduled_at)} — disponible hasta {fmt(data.my_match.window_closes_at)}.</p>
                  <button type="button" className="cinema-button" onClick={() => navigate(`/campeonato/combate/${data.my_match!.id}`)}>
                    Ir a mi combate
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
