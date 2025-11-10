import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;
const REDIRECT_KEY = 'tb.redirect';

// Google icon as inline SVG (performance: no external requests)
const GoogleIcon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

// Feature icons as inline SVG (performance: no external requests)
const FeatureIcons = {
  realtime: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  anonymous: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  admin: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  organized: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  mobile: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
};

// Memoized Feature Card Component (performance)
const FeatureCard = memo(({ icon, title, description, delay }: { icon: React.ReactElement; title: string; description: string; delay: number }) => {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className={`group relative p-6 rounded-2xl glass transition-all duration-500 hover:scale-105 hover:shadow-2xl gpu-accelerated ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="text-emerald-400 mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {description}
      </p>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/0 to-emerald-500/0 group-hover:from-emerald-500/10 group-hover:to-emerald-500/5 transition-all duration-300 pointer-events-none" />
    </div>
  );
});

FeatureCard.displayName = 'FeatureCard';

// Memoized Hero Section (performance)
const HeroSection = memo(({ onScrollToFeatures }: { onScrollToFeatures: () => void }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated gradient background */}
      <div 
        className="absolute inset-0 animate-gradient"
        style={{
          background: 'var(--gradient-hero)',
          opacity: 0.1,
        }}
      />
      
      {/* Floating orbs for depth */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-emerald-500/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1
          className={`text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ color: 'var(--color-text-primary)' }}
        >
          Make Every Meeting{' '}
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'var(--gradient-hero)' }}>
            Interactive
          </span>
        </h1>
        
        <p
          className={`text-lg sm:text-xl lg:text-2xl mb-8 max-w-3xl mx-auto leading-relaxed transition-all duration-1000 delay-200 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Turn one-way presentations into two-way conversations where everyone can participate, share feedback, and collaborate in real-time.
        </p>

        <div
          className={`flex flex-col sm:flex-row gap-4 justify-center items-center transition-all duration-1000 delay-400 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <button
            id="customGoogleSignIn"
            className="px-8 py-4 rounded-xl glass font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl gpu-accelerated flex items-center gap-3"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {GoogleIcon}
            <span>Sign in with Google</span>
          </button>
          <button
            onClick={onScrollToFeatures}
            className="px-8 py-4 rounded-xl glass font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl gpu-accelerated"
            style={{ color: 'var(--color-text-primary)' }}
          >
            See How It Works
          </button>
        </div>
      </div>
    </section>
  );
});

HeroSection.displayName = 'HeroSection';

// Memoized Features Section (performance)
const FeaturesSection = memo(() => {
  const features = useMemo(
    () => [
      {
        icon: FeatureIcons.realtime,
        title: 'Real-Time Collaboration',
        description: 'Messages appear instantly. No refresh needed.',
      },
      {
        icon: FeatureIcons.anonymous,
        title: 'Anonymous Feedback',
        description: 'Share honest feedback without revealing your identity.',
      },
      {
        icon: FeatureIcons.admin,
        title: 'Admin-Only Channels',
        description: 'Private channels for sensitive discussions.',
      },
      {
        icon: FeatureIcons.organized,
        title: 'Organized Boards',
        description: 'Keep conversations organized by topic or team.',
      },
      {
        icon: FeatureIcons.mobile,
        title: 'Mobile Responsive',
        description: 'Works seamlessly on any device.',
      },
    ],
    []
  );

  return (
    <section id="features" className="py-24 px-4 sm:px-6 lg:px-8" style={{ background: 'var(--color-bg-secondary)' }}>
      <div className="max-w-7xl mx-auto">
        <h2
          className="text-4xl sm:text-5xl font-bold text-center mb-16"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Why TeamBoard?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              delay={index * 100}
            />
          ))}
        </div>
      </div>
    </section>
  );
});

FeaturesSection.displayName = 'FeaturesSection';

// Memoized Final CTA Section (performance)
const FinalCTASection = memo(() => {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        <h2
          className="text-4xl sm:text-5xl font-bold mb-6"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Ready to Transform Your Meetings?
        </h2>
        <p
          className="text-xl mb-8"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Start engaging your team today with interactive, two-way conversations.
        </p>
        <button
          id="customGoogleSignInFinal"
          className="px-8 py-4 rounded-xl glass font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl gpu-accelerated flex items-center gap-3 mx-auto"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {GoogleIcon}
          <span>Sign in with Google</span>
        </button>
      </div>
    </section>
  );
});

FinalCTASection.displayName = 'FinalCTASection';

// Main Landing Component
export default function Landing() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const buttonRenderedRef = useRef(false);
  const finalButtonRenderedRef = useRef(false);
  const navigate = useNavigate();

  // Memoized callback for scroll (performance)
  const scrollToFeatures = useCallback(() => {
    const featuresSection = document.getElementById('features');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // If token exists, fetch user
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios
      .get(`${BACKEND}/api/test-auth`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setUser({ name: res.data.user.name, email: res.data.user.email }))
      .catch(() => setUser(null));
  }, []);

  // Google One Tap callback
  const handleCallbackResponse = useCallback(async (response: { credential: string }) => {
    try {
      setAuthenticating(true);
      setAuthError(null);
      const idToken = response.credential;
      const res = await axios.post(`${BACKEND}/api/auth/google`, { idToken });
      const token = res.data.token;
      localStorage.setItem('token', token);
      const me = await axios.get(`${BACKEND}/api/test-auth`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser({ name: me.data.user.name, email: me.data.user.email });
      setAuthenticating(false);
    } catch (e) {
      console.error('Google login error', e);
      setAuthError('Sign-in failed. Check console/network and env.');
      setAuthenticating(false);
    }
  }, []);

  // Handle custom Google sign-in button click
  const handleCustomGoogleSignIn = useCallback(() => {
    // @ts-ignore global
    if (window.google?.accounts?.id) {
      // Trigger One Tap prompt programmatically
      // @ts-ignore global
      google.accounts.id.prompt((notification: any) => {
        // Handle notification if needed
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // If One Tap is not shown, we can show a fallback or just log
          console.log('One Tap not displayed');
        }
      });
    }
  }, []);

  // Initialize Google Sign-In and attach custom button handler (performance optimized)
  useEffect(() => {
    const initializeGoogle = () => {
      // @ts-ignore global
      if (window.google?.accounts?.id) {
        // @ts-ignore global
        google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
          callback: handleCallbackResponse,
        });
        
        // Attach click handlers to custom buttons
        const customButton = document.getElementById('customGoogleSignIn');
        const customButtonFinal = document.getElementById('customGoogleSignInFinal');
        
        if (customButton && !buttonRenderedRef.current) {
          customButton.addEventListener('click', handleCustomGoogleSignIn);
          buttonRenderedRef.current = true;
        }
        
        if (customButtonFinal && !finalButtonRenderedRef.current) {
          customButtonFinal.addEventListener('click', handleCustomGoogleSignIn);
          finalButtonRenderedRef.current = true;
        }

        // Show One Tap prompt (non-blocking)
        // @ts-ignore global
        google.accounts.id.prompt();

        return true;
      }
      return false;
    };

    // Try immediately, then poll briefly
    if (!initializeGoogle()) {
      const id = setInterval(() => {
        if (initializeGoogle()) clearInterval(id);
      }, 200);
      setTimeout(() => clearInterval(id), 10000);
    }

    // Cleanup
    return () => {
      const customButton = document.getElementById('customGoogleSignIn');
      const customButtonFinal = document.getElementById('customGoogleSignInFinal');
      if (customButton) {
        customButton.removeEventListener('click', handleCustomGoogleSignIn);
      }
      if (customButtonFinal) {
        customButtonFinal.removeEventListener('click', handleCustomGoogleSignIn);
      }
    };
  }, [handleCallbackResponse, handleCustomGoogleSignIn]);

  // Auto-redirect if logged in
  useEffect(() => {
    if (!user) return;
    const redirect = localStorage.getItem(REDIRECT_KEY);
    if (redirect) {
      localStorage.removeItem(REDIRECT_KEY);
      navigate(redirect);
    } else {
      navigate('/app');
    }
  }, [user, navigate]);

  // Show loading state during auth
  if (authenticating) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--color-text-secondary)' }}>Signing in…</p>
        </div>
      </main>
    );
  }

  // Show error state
  if (authError) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="text-center max-w-md mx-auto px-4">
          <p className="text-red-500 mb-4">{authError}</p>
          <button
            onClick={() => {
              setAuthError(null);
              window.location.reload();
            }}
            className="px-6 py-3 rounded-xl glass font-semibold transition-all duration-300 hover:scale-105"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
      <HeroSection onScrollToFeatures={scrollToFeatures} />
      <FeaturesSection />
      <FinalCTASection />
    </main>
  );
}
