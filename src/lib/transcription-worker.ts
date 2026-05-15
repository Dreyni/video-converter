import { pipeline, env } from '@xenova/transformers';

// Skip local check to ensure it downloads from the hub
env.allowLocalModels = false;

let transcriber: any = null;

self.onmessage = async (e) => {
    const { audioURL, modelName } = e.data;

    try {
        if (!transcriber) {
            self.postMessage({ status: 'loading', progress: 0 });
            transcriber = await pipeline('automatic-speech-recognition', modelName, {
                progress_callback: (p: any) => {
                    if (p.status === 'progress') {
                        self.postMessage({ status: 'progress', progress: Math.round(p.progress * 100) });
                    }
                }
            });
        }

        self.postMessage({ status: 'processing', progress: 0 });
        
        // Transcribe with callback for live updates
        let fullText = '';
        const result = await transcriber(audioURL, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: false,
        });

        fullText = result.text || '';
        
        // Send the final transcript
        self.postMessage({ status: 'done', transcript: fullText, progress: 100 });
    } catch (error: any) {
        console.error('Transcription error:', error);
        self.postMessage({ 
            status: 'error', 
            error: error?.message || 'Transcription failed. Please try again.'
        });
    }
};
