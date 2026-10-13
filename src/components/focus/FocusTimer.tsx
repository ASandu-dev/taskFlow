"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, CheckCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const INITIAL_DURATION = 25 * 60; // 25 minutes in seconds

export function FocusTimer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [timeLeft, setTimeLeft] = useState(INITIAL_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const prevOpenRef = useRef(open);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const circumference = 2 * Math.PI * 90; // radius = 90

  const handleStartPause = useCallback(() => {
    if (isComplete) return;
    setIsRunning((prev) => !prev);
  }, [isComplete]);

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(INITIAL_DURATION);
    setIsComplete(false);
  };

  const handleClose = useCallback(() => {
    setIsRunning(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRunning(false);
      return;
    }
    // Only reset when opening (not when already open)
    if (!prevOpenRef.current) {
      setTimeLeft(INITIAL_DURATION);
      setIsRunning(false);
      setIsComplete(false);
    }
    prevOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!isRunning || isComplete) return;
    
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsComplete(true);
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isRunning, isComplete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isComplete) {
        handleClose();
      }
      if (e.key === " " && !isComplete) {
        e.preventDefault();
        handleStartPause();
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isComplete, handleClose, handleStartPause]);

  const progress = ((INITIAL_DURATION - timeLeft) / INITIAL_DURATION) * 100;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Focus Mode"
      description="A 25 minute focus session."
      size="xl"
      className="max-w-md"
    >
      <div className="relative flex flex-col items-center justify-center min-h-[420px] px-6">
        {!isComplete ? (
          <>
            <div className="relative w-48 h-48 mb-8">
              <svg width="192" height="192" className="transform -rotate-90">
                <circle
                  className="text-slate-100"
                  strokeWidth="12"
                  stroke="currentColor"
                  fill="transparent"
                  r="90"
                  cx="96"
                  cy="96"
                />
                <circle
                  className="transition-all duration-1000 ease-linear"
                  strokeWidth="12"
                  stroke="url(#timer-gradient)"
                  fill="transparent"
                  r="90"
                  cx="96"
                  cy="96"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7c5cfc" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-5xl font-bold tabular-nums text-slate-900">{formatTime(timeLeft)}</p>
                <p className="text-sm text-slate-500 mt-1">Focus Mode</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Button
                variant="secondary"
                size="md"
                onClick={handleReset}
                className="px-6"
                disabled={timeLeft === INITIAL_DURATION && !isRunning}
              >
                <RotateCcw className="h-5 w-5 mr-2" aria-hidden="true" />
                Reset
              </Button>
              <Button
                size="lg"
                onClick={handleStartPause}
                className="px-8 h-14"
                aria-label={isRunning ? "Pause timer" : "Start timer"}
              >
                {isRunning ? (
                  <>
                    <Pause className="h-6 w-6 mr-2" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-6 w-6 mr-2" aria-hidden="true" />
                    Start
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-500" aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Focus session complete</h2>
            <p className="text-slate-500 mb-6">Great job! You completed 25 minutes of focused work.</p>
            <Button size="lg" onClick={handleClose} className="px-8">
              Done
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
