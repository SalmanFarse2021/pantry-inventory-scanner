import { useEffect } from "react";
import confetti from "canvas-confetti";

export function WinOverlay({ onReplay }: { onReplay: () => void }) {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA502", "#FF6348"];
    const triggerConfetti = () => {
        const duration = 100;
        const end = Date.now() + duration;
        const frame = () => {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 135,
                origin: { x: 0, y: 0.5 },
                colors,
            });
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 135,
                origin: { x: 1, y: 0.5 },
                colors,
            });
            if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
    };

    useEffect(() => {
        triggerConfetti();
    }, []);

    return (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 text-center text-white">
            <h2 className="text-4xl font-bold">Nice!</h2>
            {/* needs stats here */}
            {/* swipes */}
            {/* likes */}
            {/* total time */}
            <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={triggerConfetti}
            >
                🎉 Replay confetti
            </button>
            <button
                type="button"
                className="btn btn-primary mt-4"
                onClick={onReplay}
            >
                Next
            </button>
        </div>
    );
}
