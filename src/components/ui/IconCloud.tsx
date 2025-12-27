'use client';

import React, { useEffect, useRef, useState } from 'react';

interface Icon {
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
  id: number;
}

interface IconCloudProps {
  images?: string[];
  size?: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function IconCloud({ images, size = 500 }: IconCloudProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [iconPositions, setIconPositions] = useState<Icon[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [targetRotation, setTargetRotation] = useState<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    distance: number;
    startTime: number;
    duration: number;
  } | null>(null);
  const animationFrameRef = useRef<number>(0);
  const rotationRef = useRef({ x: 0, y: 0 });
  const iconCanvasesRef = useRef<HTMLCanvasElement[]>([]);
  const imagesLoadedRef = useRef<boolean[]>([]);

  // Icon size scales with canvas
  const iconSize = Math.max(10, size * 0.1);

  // Create icon canvases once when images change
  useEffect(() => {
    if (!images) return;

    imagesLoadedRef.current = new Array(images.length).fill(false);

    const newIconCanvases = images.map((imageUrl, index) => {
      const offscreen = document.createElement('canvas');
      offscreen.width = iconSize;
      offscreen.height = iconSize;
      const offCtx = offscreen.getContext('2d');

      if (offCtx) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imageUrl;
        img.onload = () => {
          offCtx.clearRect(0, 0, offscreen.width, offscreen.height);

          // Create circular clipping path
          offCtx.beginPath();
          offCtx.arc(iconSize / 2, iconSize / 2, iconSize / 2, 0, Math.PI * 2);
          offCtx.closePath();
          offCtx.clip();

          // Draw the image
          offCtx.drawImage(img, 0, 0, iconSize, iconSize);

          imagesLoadedRef.current[index] = true;
        };
      }
      return offscreen;
    });

    iconCanvasesRef.current = newIconCanvases;
  }, [images, iconSize]);

  // Generate initial icon positions on a sphere
  useEffect(() => {
    const items = images || [];
    const newIcons: Icon[] = [];
    const numIcons = items.length || 20;

    // Fibonacci sphere parameters
    const offset = 2 / numIcons;
    const increment = Math.PI * (3 - Math.sqrt(5));

    // Scale sphere radius based on canvas size
    const sphereRadius = size * 0.3;

    for (let i = 0; i < numIcons; i++) {
      const y = i * offset - 1 + offset / 2;
      const r = Math.sqrt(1 - y * y);
      const phi = i * increment;

      const x = Math.cos(phi) * r;
      const z = Math.sin(phi) * r;

      newIcons.push({
        x: x * sphereRadius,
        y: y * sphereRadius,
        z: z * sphereRadius,
        scale: 1,
        opacity: 1,
        id: i,
      });
    }
    setIconPositions(newIcons);
  }, [images, size]);

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !canvasRef.current) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    iconPositions.forEach((icon) => {
      const cosX = Math.cos(rotationRef.current.x);
      const sinX = Math.sin(rotationRef.current.x);
      const cosY = Math.cos(rotationRef.current.y);
      const sinY = Math.sin(rotationRef.current.y);

      const rotatedX = icon.x * cosY - icon.z * sinY;
      const rotatedZ = icon.x * sinY + icon.z * cosY;
      const rotatedY = icon.y * cosX + rotatedZ * sinX;

      const screenX = canvasRef.current!.width / 2 + rotatedX;
      const screenY = canvasRef.current!.height / 2 + rotatedY;

      const sphereRadius = size * 0.3;
      const scale = (rotatedZ + sphereRadius * 1.5) / (sphereRadius * 2);
      const radius = (iconSize / 2) * scale;
      const dx = x - screenX;
      const dy = y - screenY;

      if (dx * dx + dy * dy < radius * radius) {
        const targetX = -Math.atan2(
          icon.y,
          Math.sqrt(icon.x * icon.x + icon.z * icon.z)
        );
        const targetY = Math.atan2(icon.x, icon.z);

        const currentX = rotationRef.current.x;
        const currentY = rotationRef.current.y;
        const distance = Math.sqrt(
          Math.pow(targetX - currentX, 2) + Math.pow(targetY - currentY, 2)
        );

        const duration = Math.min(2000, Math.max(800, distance * 1000));

        setTargetRotation({
          x: targetX,
          y: targetY,
          startX: currentX,
          startY: currentY,
          distance,
          startTime: performance.now(),
          duration,
        });
        return;
      }
    });

    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const deltaX = e.clientX - lastMousePos.x;
      const deltaY = e.clientY - lastMousePos.y;

      rotationRef.current = {
        x: rotationRef.current.x + deltaY * 0.002,
        y: rotationRef.current.y + deltaX * 0.002,
      };

      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Track global mouse movement across the entire page
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Use window center as reference point
      const windowCenterX = window.innerWidth / 2;
      const windowCenterY = window.innerHeight / 2;

      // Calculate offset from center of screen, normalized to canvas size
      const normalizedX = ((e.clientX - windowCenterX) / windowCenterX) * (size / 2) + (size / 2);
      const normalizedY = ((e.clientY - windowCenterY) / windowCenterY) * (size / 2) + (size / 2);

      setMousePos({ x: normalizedX, y: normalizedY });
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, [size]);

  // Animation and rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
      const dx = mousePos.x - centerX;
      const dy = mousePos.y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const speed = 0.002 + (distance / maxDistance) * 0.008;

      if (targetRotation) {
        const elapsed = performance.now() - targetRotation.startTime;
        const progress = Math.min(1, elapsed / targetRotation.duration);
        const easedProgress = easeOutCubic(progress);

        rotationRef.current = {
          x:
            targetRotation.startX +
            (targetRotation.x - targetRotation.startX) * easedProgress,
          y:
            targetRotation.startY +
            (targetRotation.y - targetRotation.startY) * easedProgress,
        };

        if (progress >= 1) {
          setTargetRotation(null);
        }
      } else if (!isDragging) {
        rotationRef.current = {
          x: rotationRef.current.x + (dy / canvas.height) * speed,
          y: rotationRef.current.y + (dx / canvas.width) * speed,
        };
      }

      // Sort icons by z-depth for proper rendering order
      const sortedIcons = [...iconPositions].map((icon) => {
        const cosX = Math.cos(rotationRef.current.x);
        const sinX = Math.sin(rotationRef.current.x);
        const cosY = Math.cos(rotationRef.current.y);
        const sinY = Math.sin(rotationRef.current.y);

        const rotatedX = icon.x * cosY - icon.z * sinY;
        const rotatedZ = icon.x * sinY + icon.z * cosY;
        const rotatedY = icon.y * cosX + rotatedZ * sinX;

        return { ...icon, rotatedX, rotatedY, rotatedZ };
      }).sort((a, b) => a.rotatedZ - b.rotatedZ);

      const sphereRadius = size * 0.3;
      sortedIcons.forEach((icon) => {
        const scale = (icon.rotatedZ + sphereRadius * 1.5) / (sphereRadius * 2);
        const opacity = Math.max(0.15, Math.min(1, (icon.rotatedZ + sphereRadius * 1.3) / (sphereRadius * 2)));

        ctx.save();
        ctx.translate(canvas.width / 2 + icon.rotatedX, canvas.height / 2 + icon.rotatedY);
        ctx.scale(scale, scale);
        ctx.globalAlpha = opacity;

        if (images && iconCanvasesRef.current[icon.id] && imagesLoadedRef.current[icon.id]) {
          const halfIcon = iconSize / 2;
          ctx.drawImage(iconCanvasesRef.current[icon.id], -halfIcon, -halfIcon, iconSize, iconSize);
        }

        ctx.restore();
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [images, iconPositions, isDragging, mousePos, targetRotation]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="rounded-lg cursor-grab active:cursor-grabbing"
      style={{ width: size, height: size }}
      aria-label="Interactive 3D Token Cloud"
      role="img"
    />
  );
}
