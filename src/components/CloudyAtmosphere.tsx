import React, {useEffect, useRef} from 'react';

/**
 * Interactive Cloudy Atmosphere Component
 * Delivers an immersive, flowing digital mist and cloudy ambient environment
 * with subtle mouse parallax, soft luminous violet/cyan/navy gradients, and glowing data particles.
 */
export const CloudyAtmosphere: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Track mouse with spring dampening
    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = width / 2;
    let targetMouseY = height / 2;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove, {passive: true});
    window.addEventListener('resize', handleResize);

    // Check for prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Organic cloud puffs
    interface CloudPuff {
      x: number;
      y: number;
      radius: number;
      vx: number;
      vy: number;
      hue: number;
      opacity: number;
      phase: number;
    }

    const clouds: CloudPuff[] = Array.from({length: 12}, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.max(width, height) * (0.35 + Math.random() * 0.25),
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.18,
      hue: i % 3 === 0 ? 195 : i % 3 === 1 ? 250 : 220, // Cyan, violet, indigo
      opacity: 0.08 + Math.random() * 0.08,
      phase: Math.random() * Math.PI * 2,
    }));

    // Micro security / data particles
    interface Particle {
      x: number;
      y: number;
      size: number;
      vx: number;
      vy: number;
      alpha: number;
      maxAlpha: number;
      color: string;
    }

    const particles: Particle[] = Array.from({length: 32}, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2 + 1,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -0.2 - Math.random() * 0.4, // gentle upward drift
      alpha: Math.random(),
      maxAlpha: 0.3 + Math.random() * 0.4,
      color: Math.random() > 0.5 ? 'rgba(56, 189, 248,' : 'rgba(129, 140, 248,',
    }));

    let time = 0;

    const render = () => {
      time += prefersReducedMotion ? 0.001 : 0.004;

      // Smooth mouse interpolation
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      const parallaxX = (mouseX / width - 0.5) * 35;
      const parallaxY = (mouseY / height - 0.5) * 25;

      ctx.clearRect(0, 0, width, height);

      // Deep cyber base gradient
      const baseGrad = ctx.createLinearGradient(0, 0, width, height);
      baseGrad.addColorStop(0, '#050811');
      baseGrad.addColorStop(0.5, '#080E1C');
      baseGrad.addColorStop(1, '#05070E');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // Draw volumetric cloud layers
      ctx.globalCompositeOperation = 'screen';
      for (const c of clouds) {
        if (!prefersReducedMotion) {
          c.x += c.vx;
          c.y += c.vy;

          if (c.x < -c.radius) c.x = width + c.radius;
          if (c.x > width + c.radius) c.x = -c.radius;
          if (c.y < -c.radius) c.y = height + c.radius;
          if (c.y > height + c.radius) c.y = -c.radius;
        }

        const currentX = c.x + parallaxX * (c.radius / (width * 0.4));
        const currentY = c.y + parallaxY * (c.radius / (height * 0.4));
        const breathing = Math.sin(time + c.phase) * 20;

        const grad = ctx.createRadialGradient(
          currentX,
          currentY,
          0,
          currentX,
          currentY,
          c.radius + breathing
        );

        if (c.hue === 195) {
          // Soft cyan light
          grad.addColorStop(0, `rgba(56, 189, 248, ${c.opacity * 1.2})`);
          grad.addColorStop(0.4, `rgba(14, 116, 144, ${c.opacity * 0.6})`);
          grad.addColorStop(1, 'rgba(6, 11, 25, 0)');
        } else if (c.hue === 250) {
          // Gentle violet mist
          grad.addColorStop(0, `rgba(139, 92, 246, ${c.opacity * 1.1})`);
          grad.addColorStop(0.5, `rgba(79, 70, 229, ${c.opacity * 0.5})`);
          grad.addColorStop(1, 'rgba(6, 11, 25, 0)');
        } else {
          // Deep royal blue mist
          grad.addColorStop(0, `rgba(37, 99, 235, ${c.opacity * 1.0})`);
          grad.addColorStop(0.6, `rgba(30, 58, 138, ${c.opacity * 0.4})`);
          grad.addColorStop(1, 'rgba(6, 11, 25, 0)');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(currentX, currentY, c.radius + breathing, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw subtle luminous AI particles
      for (const p of particles) {
        if (!prefersReducedMotion) {
          p.x += p.vx + (parallaxX * 0.01);
          p.y += p.vy;

          if (p.y < 0) {
            p.y = height + 10;
            p.x = Math.random() * width;
          }
          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
        }

        const flicker = Math.sin(time * 3 + p.x) * 0.2 + 0.8;
        ctx.fillStyle = `${p.color} ${p.maxAlpha * flicker})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';

      // Subtle fine grid overlay for cybersecurity aesthetic
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.02)';
      ctx.lineWidth = 1;
      const gridSize = 64;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
      {/* Subtle vignettes to preserve high-contrast readability in center content */}
      <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_30%,rgba(6,9,19,0.7)_100%] pointer-events-none" />
      <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-[#060913]/90 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#060913]/95 to-transparent pointer-events-none" />
    </div>
  );
};
