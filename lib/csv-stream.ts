/** Pull one bounded database page at a time; cancellation prevents subsequent reads. */
export function csvStream(header: string, page: () => Promise<{ text: string; done: boolean }>) {
    const encoder = new TextEncoder();
    let first = true, cancelled = false;
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            if (cancelled) return;
            if (first) { first = false; controller.enqueue(encoder.encode(header)); return; }
            try {
                const result = await page();
                if (cancelled) return;
                if (result.text) controller.enqueue(encoder.encode(result.text));
                if (result.done) controller.close();
            } catch (error) { if (!cancelled) controller.error(error); }
        },
        cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
}
