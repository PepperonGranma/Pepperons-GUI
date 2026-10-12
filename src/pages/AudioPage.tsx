import { AudioLines, Info, Mic2, Radio, Zap } from 'lucide-react'
import { type PageBaseProps, PageFrame, SectionCard, Field, Select, Switch } from '../controls'
import type { DeviceCapabilities, StudioConfig } from '../types'

export function AudioPage({ config, update, setConfig, capabilities }: PageBaseProps & { capabilities: DeviceCapabilities | null }) {
  const unavailable = capabilities?.audio.forwardingSupported === false
  const reportedCodecs = capabilities?.audio.codecs || []
  return <PageFrame title="Audio room" subtitle="Route Android playback, microphones, and voice sources." icon={<AudioLines />}>
    <div className="settings-grid">
      <SectionCard title="Audio capture" kicker="SIGNAL" icon={<Mic2 size={18} />}>
        <Switch label="Forward audio" description={capabilities?.audio.supportMessage || 'Requires Android 11 or newer for device audio.'} checked={unavailable ? false : config.audioEnabled} disabled={unavailable} onChange={(value) => update('audioEnabled', value)} />
        {unavailable && <div className="inline-warning"><Info size={14} />Audio forwarding is unavailable on this Android version.</div>}
        <Select label="Source" value={config.audioSource} disabled={!config.audioEnabled} onChange={(value) => setConfig((current) => ({ ...current, audioSource: value, audioDup: value === 'playback' ? current.audioDup : false }))} options={[
          ['output', 'Device output'], ['playback', 'Playback (keep local optional)'], ['mic', 'Microphone'], ['mic-unprocessed', 'Microphone · unprocessed'],
          ['mic-camcorder', 'Microphone · camcorder'], ['mic-voice-recognition', 'Voice recognition'], ['mic-voice-communication', 'Voice communication'],
          ['voice-call', 'Voice call'], ['voice-call-uplink', 'Voice call · uplink'], ['voice-call-downlink', 'Voice call · downlink'], ['voice-performance', 'Live performance'],
        ]} />
        <Switch label="Duplicate playback" description="Keep playback on the phone; valid with the playback source." checked={config.audioDup} disabled={config.audioSource !== 'playback'} onChange={(value) => update('audioDup', value)} />
      </SectionCard>
      <SectionCard title="Audio encoding" kicker="CODEC" icon={<Radio size={18} />}>
        <Select label="Codec" value={config.audioCodec} onChange={(value) => update('audioCodec', value as StudioConfig['audioCodec'])} options={[['opus', 'Opus', reportedCodecs.length > 0 && !reportedCodecs.includes('opus')], ['aac', 'AAC', reportedCodecs.length > 0 && !reportedCodecs.includes('aac')], ['flac', 'FLAC', reportedCodecs.length > 0 && !reportedCodecs.includes('flac')], ['raw', 'Raw PCM', reportedCodecs.length > 0 && !reportedCodecs.includes('raw')]]} />
        <Select label="Audio encoder" value={config.audioEncoder} onChange={(value) => update('audioEncoder', value)} options={[['', 'Automatic'], ...(capabilities?.audio.encoders.filter((encoder) => encoder.codec === config.audioCodec).map((encoder) => [encoder.name, encoder.name] as [string, string]) || [])]} />
        <div className="field-grid"><Field flag="--audio-bit-rate" label="Bit rate" value={config.audioBitRate} onChange={(value) => update('audioBitRate', value)} />
          <Field flag="--audio-buffer" label="Buffer" value={config.audioBuffer} onChange={(value) => update('audioBuffer', value)} suffix="ms" /></div>
      </SectionCard>
      <SectionCard title="Latency note" kicker="MONITOR" icon={<Zap size={18} />} className="accent-note">
        <p>Smaller buffers feel more immediate, but raise the chance of glitches on busy or wireless connections. Start at 50 ms and tune downward.</p>
        <div className="latency-scale"><span>Immediate</span><div><i style={{ left: `${Math.min(100, Number(config.audioBuffer) / 2)}%` }} /></div><span>Stable</span></div>
      </SectionCard>
    </div>
  </PageFrame>
}
