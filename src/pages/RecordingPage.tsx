import { Activity, CircleDot as Record, Clipboard } from 'lucide-react'
import { api } from '../api'
import { type PageBaseProps, PageFrame, SectionCard, Field, Select, Switch } from '../controls'
import type { StudioConfig } from '../types'

export function RecordingPage({ config, update }: PageBaseProps) {
  async function choosePath() {
    const file = await api.chooseRecordingPath(config.recordFormat)
    if (file) update('recordPath', file)
  }
  return <PageFrame title="Recording booth" subtitle="Capture the mirrored session without sacrificing Scrcpy's native responsiveness." icon={<Record />}>
    <div className="settings-grid">
      <SectionCard title="Record session" kicker="OUTPUT" icon={<Record size={18} />}>
        <Switch label="Enable recording" description="The recording begins and ends with the mirroring session." checked={config.recordingEnabled} onChange={(value) => update('recordingEnabled', value)} />
        <Select label="Container" value={config.recordFormat} disabled={!config.recordingEnabled} onChange={(value) => update('recordFormat', value as StudioConfig['recordFormat'])}
          options={[['mp4', 'MP4 · video + audio'], ['mkv', 'MKV · video + audio'], ['m4a', 'M4A · audio'], ['mka', 'MKA · audio'], ['opus', 'Opus'], ['aac', 'AAC'], ['flac', 'FLAC'], ['wav', 'WAV']]} />
        <label className="field"><span>Destination</span><div className="path-field"><input value={config.recordPath} disabled={!config.recordingEnabled} onChange={(event) => update('recordPath', event.target.value)} placeholder="Choose a local file…" /><button onClick={choosePath} disabled={!config.recordingEnabled}>Browse</button></div></label>
      </SectionCard>
      <SectionCard title="Playback & timing" kicker="SESSION" icon={<Activity size={18} />}>
        <Switch label="Record without playback" description="Capture to file without opening video or audio playback." checked={config.noPlayback} onChange={(value) => update('noPlayback', value)} />
        <Field flag="--time-limit" label="Time limit" value={config.timeLimit} onChange={(value) => update('timeLimit', value)} suffix="seconds" placeholder="Unlimited" />
      </SectionCard>
      <SectionCard title="Capture recipe" kicker="SUMMARY" icon={<Clipboard size={18} />} className="recipe-card">
        <div className="recipe-art" data-tilt="1"><span className={config.recordingEnabled ? 'armed' : ''}><Record /></span><i /></div>
        <h3>{config.recordingEnabled ? 'Recording armed' : 'Recording is off'}</h3>
        <p>{config.recordingEnabled ? `${config.recordFormat.toUpperCase()} · ${config.videoEnabled ? config.videoCodec.toUpperCase() : 'No video'} · ${config.audioEnabled ? config.audioCodec.toUpperCase() : 'No audio'}` : 'Enable recording and choose a destination to arm this session.'}</p>
      </SectionCard>
    </div>
  </PageFrame>
}
