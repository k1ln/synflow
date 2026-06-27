/**
 * Utility to measure actual microphone latency
 * Usage: Run this in your browser console after audio starts
 */

export function measureMicLatency() {
  const ctx = (window as any).__audioContext;
  
  if (!ctx) {
    console.error('Audio context not found. Start audio playback first.');
    return;
  }

  console.log('=== Microphone Latency Test ===');
  console.log('Hardware latency:', (ctx.baseLatency * 1000).toFixed(2), 'ms');
  console.log('Output latency:', (ctx.outputLatency * 1000).toFixed(2), 'ms');
  console.log('Total system latency:', ((ctx.baseLatency + ctx.outputLatency) * 1000).toFixed(2), 'ms');
}

/**
 * Automated round-trip latency test
 * Sends a click through output and measures when it returns through input
 * IMPORTANT: Connect your audio output to input (speakers to mic or cable loopback)
 */
export async function autoMeasureLatency(deviceId?: string): Promise<number | null> {
  const ctx = (window as any).__audioContext;
  
  if (!ctx) {
    console.error('Audio context not found. Start audio playback first.');
    return null;
  }

  console.log('=== Automated Latency Measurement ===');
  console.log('SETUP: Connect your speakers/headphones output to microphone input');
  console.log('(Or play from speakers loud enough for mic to pick up)');
  console.log('Starting test in 2 seconds...\n');

  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: ctx.sampleRate
      }
    });

    const activeTrack = stream.getAudioTracks()[0];
    if (activeTrack) {
      console.log('Using input device:', activeTrack.label || '(label not available yet)');
    }

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    // Create test signal: short click (100ms at 1000Hz)
    const clickDuration = 0.1; // 100ms
    const oscillator = ctx.createOscillator();
    const clickGain = ctx.createGain();
    
    oscillator.frequency.value = 1000; // 1kHz tone
    oscillator.connect(clickGain);
    clickGain.connect(ctx.destination);
    
    // Envelope: quick attack and release
    const now = ctx.currentTime;
    clickGain.gain.setValueAtTime(0, now);
    clickGain.gain.linearRampToValueAtTime(0.3, now + 0.01); // 10ms attack
    clickGain.gain.linearRampToValueAtTime(0, now + clickDuration); // 90ms release

    // Track when we send the signal
    const sendTime = performance.now();
    let detected = false;
    let receiveTime = 0;
    const threshold = 30; // Detection threshold (adjust if needed)
    const maxWaitTime = 1000; // Wait max 1 second

    // Monitor input for the click
    const checkForSignal = () => {
      analyser.getByteTimeDomainData(dataArray);
      
      // Look for signal above threshold
      let maxAmplitude = 0;
      for (let i = 0; i < bufferLength; i++) {
        const amplitude = Math.abs(dataArray[i] - 128);
        if (amplitude > maxAmplitude) {
          maxAmplitude = amplitude;
        }
      }

      if (maxAmplitude > threshold && !detected) {
        detected = true;
        receiveTime = performance.now();
        const latency = receiveTime - sendTime;
        
        console.log('✓ Signal detected!');
        console.log(`Round-trip latency: ${latency.toFixed(2)} ms`);
        console.log(`Input latency: ~${(latency / 2).toFixed(2)} ms`);
        console.log(`Output latency: ~${(latency / 2).toFixed(2)} ms`);
        
        // Cleanup
        oscillator.stop();
        source.disconnect();
        analyser.disconnect();
        stream.getTracks().forEach(t => t.stop());
        
        return latency;
      }

      if (performance.now() - sendTime < maxWaitTime && !detected) {
        requestAnimationFrame(checkForSignal);
      } else if (!detected) {
        console.error('✗ No signal detected. Make sure:');
        console.error('  1. Output is connected to input (cable or speakers → mic)');
        console.error('  2. Microphone volume is turned up');
        console.error('  3. No other apps are using the microphone');
        
        oscillator.stop();
        source.disconnect();
        analyser.disconnect();
        stream.getTracks().forEach(t => t.stop());
      }
    };

    // Start monitoring before sending signal
    requestAnimationFrame(checkForSignal);
    
    // Send the test signal
    oscillator.start(now);
    oscillator.stop(now + clickDuration);

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(detected ? receiveTime - sendTime : null);
      }, maxWaitTime + 100);
    });

  } catch (error) {
    console.error('Failed to measure latency:', error);
    return null;
  }
}

export async function listAudioInputDevices(): Promise<Array<{ id: string; label: string }>> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices
    .filter(d => d.kind === 'audioinput')
    .map(d => ({ id: d.deviceId, label: d.label || '(label hidden until mic permission granted)' }));
  console.table(inputs);
  return inputs;
}

// Expose globally
(window as any).measureMicLatency = measureMicLatency;
(window as any).autoMeasureLatency = autoMeasureLatency;
(window as any).listAudioInputDevices = listAudioInputDevices;
