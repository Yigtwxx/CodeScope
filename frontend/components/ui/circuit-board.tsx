"use client"

import { useEffect, useState } from "react"

export function CircuitBoard() {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {/* 
        Background Grid 
        Static but adds texture to the 'gray' frame area.
      */}
            <svg
                className="absolute w-full h-full opacity-[0.2]"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <pattern
                        id="circuit-pattern"
                        x="0"
                        y="0"
                        width="40"
                        height="40"
                        patternUnits="userSpaceOnUse"
                    >
                        <path d="M10 10 H 30 V 30 H 10 Z" fill="none" stroke="#60a5fa" strokeWidth="0.5" className="opacity-20" />
                        <path d="M20 0 V 40 M 0 20 H 40" fill="none" stroke="#60a5fa" strokeWidth="0.5" className="opacity-10" />
                        <circle cx="20" cy="20" r="1.5" fill="#60a5fa" className="opacity-30" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#circuit-pattern)" />
            </svg>

            {/* 
        SNAKE ANIMATIONS 
        Bright, fast-moving lines that look like data flowing.
      */}
            <svg className="absolute w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="snake-gradient-h" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="transparent" />
                        <stop offset="50%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#93c5fd" />
                    </linearGradient>
                    <linearGradient id="snake-gradient-v" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="transparent" />
                        <stop offset="50%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#93c5fd" />
                    </linearGradient>
                </defs>

                <g className="circuit-snakes">
                    {/* Horizontal Snakes - Random positions */}
                    {[...Array(20)].map((_, i) => (
                        <path
                            key={`h-${i}`}
                            d={`M -200 ${i * 100 + Math.random() * 50} H 3000`}
                            fill="none"
                            stroke="url(#snake-gradient-h)"
                            strokeWidth="2"
                            className="animate-circuit-flow-h opacity-0"
                            style={{
                                animationDuration: `${2 + Math.random() * 4}s`,
                                animationDelay: `${Math.random() * 3}s`
                            }}
                        />
                    ))}

                    {/* Vertical Snakes - Random positions */}
                    {[...Array(30)].map((_, i) => (
                        <path
                            key={`v-${i}`}
                            d={`M ${i * 120 + Math.random() * 50} -200 V 2000`}
                            fill="none"
                            stroke="url(#snake-gradient-v)"
                            strokeWidth="2"
                            className="animate-circuit-flow-v opacity-0"
                            style={{
                                animationDuration: `${3 + Math.random() * 4}s`,
                                animationDelay: `${Math.random() * 3}s`
                            }}
                        />
                    ))}
                </g>
            </svg>

            <style jsx>{`
        .animate-circuit-flow-h {
            stroke-dasharray: 150 3000;
            stroke-dashoffset: 3150;
            animation-name: flow-h;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
            opacity: 0.8;
            filter: drop-shadow(0 0 2px #3b82f6);
        }
        .animate-circuit-flow-v {
            stroke-dasharray: 150 3000;
            stroke-dashoffset: 3150;
            animation-name: flow-v;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
            opacity: 0.8;
           filter: drop-shadow(0 0 2px #3b82f6);
        }

        @keyframes flow-h {
            to { stroke-dashoffset: -3000; }
        }
        @keyframes flow-v {
            to { stroke-dashoffset: -3000; }
        }
      `}</style>
        </div>
    )
}
