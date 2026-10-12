import { useMemo } from 'react'
import { Box, Camera, Cpu, ShieldCheck, Sparkles, Video } from 'lucide-react'
import { BrandMark, IS_WINDOWS, type PageBaseProps, PageFrame, SectionCard, Field, Select, Switch, Segmented } from '../controls'
import { describeDevice } from '../suggestions.mjs'
import type { DeviceCapabilities, StudioConfig } from '../types'

const PLATFORM_DECODER: [string, string] = IS_WINDOWS ? ['d3d11va', 'D3D11VA · Windows GPU'] : navigator.userAgent.includes('Mac') ? ['videotoolbox', 'VideoToolbox · macOS GPU'] : ['vaapi', 'VA-API · Linux GPU']

export function VideoPage({ config, update, capabilities, hwdecAvailable }: PageBaseProps & { capabilities: DeviceCapabilities | null; hwdecAvailable: boolean }) {
  const profile = useMemo(() => describeDevice(capabilities), [capabilities])
  const softwareCodec = config.videoEnabled && profile.reported && profile.codecs.has(config.videoCodec) && !profile.hardware.has(config.videoCodec)
  const decoders: Array<[string, string, boolean?]> = [['auto', 'Automatic · GPU when possible'], PLATFORM_DECODER, ['disabled', 'Software only']]
  // A decoder for another platform can arrive through an imported profile; show it rather than hide it.
  if (!decoders.some(([value]) => value === config.hwdec)) decoders.push([config.hwdec, `${config.hwdec} · not available here`, true])
  const reportedCodecs = capabilities?.video.codecs || []
  const hasCodecData = reportedCodecs.length > 0
  const cameraOptions: Array<[string, string]> = [['', 'Automatic'], ...(capabilities?.camera.cameras || []).map((camera) => [camera.id, `${camera.id}${camera.facing ? ` · ${camera.facing}` : ''}`] as [string, string])]
  const selectedCamera = capabilities?.camera.cameras.find((camera) => camera.id === config.cameraId)
  const fpsShortcuts = [...new Set([30, 60, ...(capabilities?.display.supportedRefreshRates || []).map(Math.round)])].sort((a, b) => a - b)
  return <PageFrame title="Video studio" subtitle="Shape the mirror before it leaves your Android device." icon={<Video />}>
    <div className="settings-grid">
      <SectionCard title="Capture source" kicker="SOURCE" icon={<Camera size={18} />}>
        <Switch label="Forward video" description="Turn this off for an audio-only session." checked={config.videoEnabled} onChange={(value) => update('videoEnabled', value)} />
        <Segmented disabled={!config.videoEnabled} value={config.videoSource} onChange={(value) => update('videoSource', value as StudioConfig['videoSource'])} options={[['display', 'Display'], ['camera', 'Camera']]} />
        {config.videoEnabled && config.videoSource === 'camera' && <div className="field-grid">
          <Select label="Camera ID" value={config.cameraId} disabled={Boolean(config.cameraFacing)} onChange={(value) => { update('cameraId', value); if (value) update('cameraFacing', '') }} options={cameraOptions} />
          <Select label="Facing" value={config.cameraFacing} disabled={Boolean(config.cameraId)} onChange={(value) => { update('cameraFacing', value as StudioConfig['cameraFacing']); if (value) update('cameraId', '') }} options={[['', 'Auto'], ['front', 'Front'], ['back', 'Back'], ['external', 'External']]} />
          <Field flag="--camera-size" label="Camera size" value={config.cameraSize} onChange={(value) => update('cameraSize', value)} placeholder="1920x1080" />
          <Field flag="--camera-fps" label="Camera FPS" value={config.cameraFps} onChange={(value) => update('cameraFps', value)} />
          <Switch label="Camera torch" checked={config.cameraTorch} onChange={(value) => update('cameraTorch', value)} />
          {selectedCamera && <div className="capability-hint">Reported sizes: {selectedCamera.sizes.join(', ') || 'Not reported'} · FPS: {selectedCamera.frameRates.join(', ') || 'Not reported'}</div>}
        </div>}
      </SectionCard>
      <SectionCard title="Encoding" kicker="QUALITY" icon={<Cpu size={18} />}>
        <Select label="Video codec" value={config.videoCodec} disabled={!config.videoEnabled} onChange={(value) => update('videoCodec', value as StudioConfig['videoCodec'])}
          options={[['h264', 'H.264 · compatible', hasCodecData && !reportedCodecs.includes('h264')], ['h265', 'H.265 · efficient', hasCodecData && !reportedCodecs.includes('h265')], ['av1', 'AV1 · modern', hasCodecData && !reportedCodecs.includes('av1')], ['vp8', 'VP8 · v4.1', hasCodecData && !reportedCodecs.includes('vp8')], ['vp9', 'VP9 · v4.1', hasCodecData && !reportedCodecs.includes('vp9')]]} />
        <Select label="Video encoder" value={config.videoEncoder} disabled={!config.videoEnabled} onChange={(value) => update('videoEncoder', value)} options={[['', 'Automatic'], ...(capabilities?.video.encoders.filter((encoder) => encoder.codec === config.videoCodec).map((encoder) => [encoder.name, encoder.name] as [string, string]) || [])]} />
        <Select label="Hardware decoding" value={hwdecAvailable ? config.hwdec : 'auto'} disabled={!config.videoEnabled || !hwdecAvailable} onChange={(value) => update('hwdec', value as StudioConfig['hwdec'])} options={decoders} />
        {!hwdecAvailable && <div className="capability-hint"><ShieldCheck size={13} />Choosing a decoder needs scrcpy 5.0 or newer. Update the runtime from the Studio page.</div>}
        {softwareCodec && <div className="inline-warning"><Cpu size={13} />{config.videoCodec.toUpperCase()} has no hardware encoder on this phone, so it is encoded in software. scrcpy lowers the frame size by itself if the encoder cannot keep up; H.264{profile.hardware.has('h265') ? ' or H.265' : ''} is lighter.</div>}
        {hasCodecData && <div className="capability-hint"><ShieldCheck size={13} />Reported by device: {reportedCodecs.map((codec) => codec.toUpperCase()).join(', ')}</div>}
        <div className="field-grid"><Field flag="--video-bit-rate" label="Bit rate" value={config.videoBitRate} disabled={!config.videoEnabled} onChange={(value) => update('videoBitRate', value)} hint="Supports K and M suffixes" />
          <Field flag="--video-buffer" label="Video buffer" value={config.videoBuffer} disabled={!config.videoEnabled} onChange={(value) => update('videoBuffer', value)} suffix="ms" /></div>
      </SectionCard>
      <SectionCard title="Frame geometry" kicker="CANVAS" icon={<Box size={18} />}>
        <div className="field-grid"><Field flag="--max-size" label="Maximum size" value={config.maxSize} disabled={!config.videoEnabled} onChange={(value) => update('maxSize', value)} suffix="px" />
          <Field flag="--max-fps" label="Maximum FPS" value={config.maxFps} disabled={!config.videoEnabled} onChange={(value) => update('maxFps', value)} suffix="fps" /></div>
        <div className="value-shortcuts">{fpsShortcuts.map((fps) => <button disabled={!config.videoEnabled} className={config.maxFps === String(fps) ? 'active' : ''} key={fps} onClick={() => update('maxFps', String(fps))}>{fps} FPS</button>)}</div>
        <Field flag="--crop" label="Crop" value={config.crop} disabled={!config.videoEnabled} onChange={(value) => update('crop', value)} placeholder="width:height:x:y" hint="Uses the device's natural orientation" />
      </SectionCard>
      <VisualSummary config={config} />
    </div>
  </PageFrame>
}

function VisualSummary({ config }: { config: StudioConfig }) {
  return <SectionCard title="Signal preview" kicker="OUTPUT" icon={<Sparkles size={18} />} className="signal-preview-card">
    <div className="signal-art" data-tilt="18"><div className="pixel-grid" /><div className="signal-phone"><BrandMark /></div><div className="signal-rays" /></div>
    <div className="summary-badges">{config.videoEnabled ? <><span>{config.maxSize}px</span><span>{config.maxFps} fps</span><span>{config.videoCodec.toUpperCase()}</span><span>{config.videoBitRate}</span></> : <><span>VIDEO OFF</span><span>AUDIO ONLY</span><span>{config.audioCodec.toUpperCase()}</span></>}</div>
  </SectionCard>
}
