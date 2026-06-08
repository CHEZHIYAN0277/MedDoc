import { useState, useEffect, useRef } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';

interface TrailDot {
  x: number;
  y: number;
  id: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  angle: number;
  velocity: number;
}

export const CustomCursor = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [trail, setTrail] = useState<TrailDot[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const trailIdRef = useRef(0);
  const particleIdRef = useRef(0);
  
  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);
  
  const springX = useSpring(cursorX, { stiffness: 500, damping: 28 });
  const springY = useSpring(cursorY, { stiffness: 500, damping: 28 });

  // Magnetic attraction constants
  const ATTRACTION_RADIUS = 60;
  const ATTRACTION_STRENGTH = 0.3;

  const findNearestInteractive = (x: number, y: number) => {
    const interactiveElements = document.querySelectorAll(
      'button, a, [data-magnetic], .cursor-pointer'
    );
    
    let nearest: { centerX: number; centerY: number; distance: number } | null = null;
    let nearestDistance = Infinity;
    
    interactiveElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(x - centerX, y - centerY);
      
      if (distance < nearestDistance && distance < ATTRACTION_RADIUS) {
        nearest = { centerX, centerY, distance };
        nearestDistance = distance;
      }
    });
    
    return nearest;
  };

  useEffect(() => {
    // Check for touch device
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (isTouchDevice) return;

    const handleMouseMove = (e: MouseEvent) => {
      let targetX = e.clientX;
      let targetY = e.clientY;
      
      // Apply magnetic attraction
      const nearest = findNearestInteractive(e.clientX, e.clientY);
      if (nearest) {
        const pullStrength = (1 - nearest.distance / ATTRACTION_RADIUS) * ATTRACTION_STRENGTH;
        targetX += (nearest.centerX - e.clientX) * pullStrength;
        targetY += (nearest.centerY - e.clientY) * pullStrength;
      }
      
      cursorX.set(targetX);
      cursorY.set(targetY);
      setIsVisible(true);
      
      // Add trail dot (increased to 8 dots)
      trailIdRef.current += 1;
      setTrail(prev => [
        ...prev.slice(-7),
        { x: targetX, y: targetY, id: trailIdRef.current }
      ]);
    };

    const handleMouseEnter = () => setIsVisible(true);
    const handleMouseLeave = () => setIsVisible(false);
    
    const handleMouseDown = (e: MouseEvent) => {
      setIsClicking(true);
      
      // Spawn 8 particles in circular pattern with smaller spread
      const newParticles: Particle[] = Array.from({ length: 8 }, (_, i) => {
        particleIdRef.current += 1;
        return {
          id: particleIdRef.current,
          x: e.clientX,
          y: e.clientY,
          angle: (i * 45) * (Math.PI / 180), // Even distribution
          velocity: 20 + Math.random() * 15,
        };
      });
      setParticles(prev => [...prev, ...newParticles]);
      
      // Clean up old particles after animation
      setTimeout(() => {
        setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
      }, 700);
    };
    
    const handleMouseUp = () => setIsClicking(false);

    const handleHoverStart = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('a') ||
        target.classList.contains('cursor-pointer')
      ) {
        setIsHovering(true);
      }
    };

    const handleHoverEnd = () => {
      setIsHovering(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseenter', handleMouseEnter);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseover', handleHoverStart);
    document.addEventListener('mouseout', handleHoverEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseenter', handleMouseEnter);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseover', handleHoverStart);
      document.removeEventListener('mouseout', handleHoverEnd);
    };
  }, [cursorX, cursorY]);

  // Check for touch device on mount
  const [isTouchDevice, setIsTouchDevice] = useState(true);
  
  useEffect(() => {
    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  if (isTouchDevice) return null;

  return (
    <>
      {/* Click particles */}
      {particles.map((particle) => {
        const endX = particle.x + Math.cos(particle.angle) * particle.velocity;
        const endY = particle.y + Math.sin(particle.angle) * particle.velocity;
        
        return (
          <motion.div
            key={particle.id}
            className="fixed pointer-events-none z-[9997]"
            initial={{ 
              opacity: 1, 
              scale: 1,
              left: particle.x,
              top: particle.y,
            }}
            animate={{ 
              opacity: 0, 
              scale: 0.3,
              left: endX,
              top: endY,
            }}
            transition={{ 
              duration: 0.6, 
              ease: "easeOut" 
            }}
            style={{
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div 
              className="w-2 h-2 rounded-full bg-primary"
              style={{
                boxShadow: '0 0 10px hsl(var(--primary) / 0.8)',
              }}
            />
          </motion.div>
        );
      })}
      
      {/* Enhanced trail dots with varying sizes and opacity */}
      {trail.map((dot, index) => {
        const progress = index / trail.length; // 0 to 1, oldest to newest
        const size = 8 + progress * 10; // Plus trail: 8px to 18px
        const opacity = 0.2 + progress * 0.5; // More opaque near cursor
        const barThickness = size * 0.25;
        const glowIntensity = 4 + progress * 6;
        const glowOpacity = 0.3 + progress * 0.4;
        
        return (
          <motion.div
            key={dot.id}
            className="fixed pointer-events-none z-[9998]"
            initial={{ opacity: opacity, scale: 1, rotate: 0 }}
            animate={{ opacity: 0, scale: 0.3, rotate: 45 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{
              left: dot.x,
              top: dot.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="relative" style={{ width: size, height: size }}>
              {/* Vertical bar */}
              <div 
                className="absolute bg-primary/60 rounded-full"
                style={{
                  width: barThickness,
                  height: size,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  boxShadow: `0 0 ${glowIntensity}px hsl(var(--primary) / ${glowOpacity})`,
                }}
              />
              {/* Horizontal bar */}
              <div 
                className="absolute bg-primary/60 rounded-full"
                style={{
                  width: size,
                  height: barThickness,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  boxShadow: `0 0 ${glowIntensity}px hsl(var(--primary) / ${glowOpacity})`,
                }}
              />
            </div>
          </motion.div>
        );
      })}
      
      {/* Main cursor */}
      <motion.div
        className="fixed pointer-events-none z-[9999]"
        style={{
          left: springX,
          top: springY,
          transform: 'translate(-50%, -50%)',
        }}
        animate={{
          opacity: isVisible ? 1 : 0,
          scale: isClicking ? 0.9 : isHovering ? 1.15 : 1,
        }}
        transition={{
          opacity: { duration: 0.2 },
          scale: { type: "spring", stiffness: 400, damping: 20 },
        }}
      >
        {/* Glow ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            width: 40,
            height: 40,
            transform: 'translate(-50%, -50%)',
            left: '50%',
            top: '50%',
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, transparent 70%)',
            filter: 'blur(8px)',
          }}
          animate={{
            scale: isHovering ? 1.5 : 1,
            opacity: isHovering ? 0.8 : 0.5,
          }}
        />
        
        {/* Plus symbol */}
        <div 
          className="relative flex items-center justify-center"
          style={{
            width: 24,
            height: 24,
          }}
        >
          {/* Vertical bar */}
          <motion.div
            className="absolute bg-primary rounded-full"
            style={{
              width: 3,
              height: 14,
              boxShadow: '0 0 12px hsl(var(--primary) / 0.6)',
            }}
            animate={{
              height: isHovering ? 18 : 14,
              boxShadow: isHovering 
                ? '0 0 20px hsl(var(--primary) / 0.8)' 
                : '0 0 12px hsl(var(--primary) / 0.6)',
            }}
          />
          
          {/* Horizontal bar */}
          <motion.div
            className="absolute bg-primary rounded-full"
            style={{
              width: 14,
              height: 3,
              boxShadow: '0 0 12px hsl(var(--primary) / 0.6)',
            }}
            animate={{
              width: isHovering ? 18 : 14,
              boxShadow: isHovering 
                ? '0 0 20px hsl(var(--primary) / 0.8)' 
                : '0 0 12px hsl(var(--primary) / 0.6)',
            }}
          />
        </div>
      </motion.div>
    </>
  );
};
