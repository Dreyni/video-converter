import { pipeline, env } from '@xenova/transformers';

// Skip local check to ensure it downloads from the hub
env.allowLocalModels = false;

let transcriber: any = null;

self.onmessage = async (e) => {
    const { audioURL, modelName } = e.data;

    try {
        if (!transcriber) {
            self.postMessage({ status: 'loading', message: 'Loading AI model...' });
            transcriber = await pipeline('automatic-speech-recognition', modelName, {
                progress_callback: (p: any) => {
                    if (p.status === 'progress') {
                        self.postMessage({ status: 'progress', progress: Math.round(p.progress) });
                    }
                }
            });
        }

        self.postMessage({ status: 'processing', message: 'Analyzing audio...' });
        
        const result = await transcriber(audioURL, {
            chunk_length_s: 30,
            stride_length_s: 5,
        });

        self.postMessage({ status: 'done', transcript: result.text });
    } catch (error: any) {
        self.postMessage({ status: 'error', error: error.message });
    }
};
