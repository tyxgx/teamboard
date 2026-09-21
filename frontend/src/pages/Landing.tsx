import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { postWithWakeRetry } from '../api/wake';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;
const REDIRECT_KEY = 'tb.redirect';

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
      className={`group relative rounded-2xl border border-black/5 bg-white/70 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_40px_-16px_rgba(16,185,129,0.25)] gpu-accelerated dark:border-white/5 dark:bg-white/5 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 dark:text-emerald-400">
        {icon}
      </div>
      <h3 className="mb-1.5 text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {description}
      </p>
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-transparent transition-all duration-300 group-hover:ring-emerald-500/20" />
    </div>
  );
});

FeatureCard.displayName = 'FeatureCard';

// Memoized Hero Section (performance)
const HeroSection = memo(({
  onScrollToFeatures,
  onGoogleSuccess,
  onGoogleError,
}: {
  onScrollToFeatures: () => void;
  onGoogleSuccess: (credentialResponse: CredentialResponse) => void;
  onGoogleError: () => void;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden">
      {/* Ambient accent glow, not a moving rainbow gradient */}
      <div className="absolute inset-0" style={{ background: 'var(--gradient-hero)' }} />
      <div className="grain-overlay" />

      {/* A single soft accent orb for depth, no competing purple */}
      <div className="absolute -top-24 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl animate-float" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <span
          className={`mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-1.5 text-xs font-medium tracking-wide text-emerald-700 transition-all duration-700 dark:text-emerald-400 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live boards, no refresh needed
        </span>

        <h1
          className={`text-balance mb-6 text-5xl font-bold leading-[1.05] tracking-tight transition-all duration-1000 sm:text-6xl lg:text-7xl ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ color: 'var(--color-text-primary)' }}
        >
          Make every meeting{' '}
          <span className="relative whitespace-nowrap text-emerald-500">
            interactive
            <svg
              className="absolute -bottom-1 left-0 w-full text-emerald-500/40"
              viewBox="0 0 200 8"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path d="M1 5.5C40 1 120 1 199 5.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
            </svg>
          </span>
        </h1>

        <p
          className={`text-pretty mx-auto mb-9 max-w-2xl text-lg leading-relaxed transition-all delay-200 duration-1000 sm:text-xl ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Turn one-way presentations into two-way conversations where everyone can participate, share feedback, and collaborate in real time.
        </p>

        <div
          className={`flex flex-col items-center justify-center gap-4 transition-all delay-[400ms] duration-1000 sm:flex-row ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="overflow-hidden rounded-xl shadow-[0_12px_30px_-10px_rgba(16,185,129,0.45)] gpu-accelerated">
            <GoogleLogin
              onSuccess={onGoogleSuccess}
              onError={onGoogleError}
              theme="outline"
              size="large"
              shape="pill"
              text="signin_with"
            />
          </div>
          <button
            onClick={onScrollToFeatures}
            className="rounded-xl border border-black/10 bg-white/60 px-7 py-3.5 text-sm font-semibold backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/30 hover:shadow-lg active:translate-y-0 gpu-accelerated dark:border-white/10 dark:bg-white/5"
            style={{ color: 'var(--color-text-primary)' }}
          >
            See how it works
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
    <section id="features" className="relative px-4 py-24 sm:px-6 lg:px-8" style={{ background: 'var(--color-bg-secondary)' }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-14 max-w-xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Why teams use it</p>
          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: 'var(--color-text-primary)' }}>
            Built for the conversation, not just the slides
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <div key={feature.title} className={index === 0 ? 'md:col-span-2 lg:col-span-1' : ''}>
              <FeatureCard
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                delay={index * 100}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

FeaturesSection.displayName = 'FeaturesSection';

// Memoized Final CTA Section (performance)
const FinalCTASection = memo(({
  onGoogleSuccess,
  onGoogleError,
}: {
  onGoogleSuccess: (credentialResponse: CredentialResponse) => void;
  onGoogleError: () => void;
}) => {
  return (
    <section className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      <div className="absolute left-1/2 top-0 h-px w-24 -translate-x-1/2 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 h-64 -translate-y-1/2"
        style={{ background: 'radial-gradient(50% 100% at 50% 50%, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0) 70%)' }}
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-balance mb-4 text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: 'var(--color-text-primary)' }}>
          Ready to make your next meeting a conversation?
        </h2>
        <p className="mx-auto mb-9 max-w-lg text-lg" style={{ color: 'var(--color-text-secondary)' }}>
          Start engaging your team today with live, two-way boards.
        </p>
        <div className="inline-block overflow-hidden rounded-xl shadow-[0_12px_30px_-10px_rgba(16,185,129,0.45)] gpu-accelerated">
          <GoogleLogin
            onSuccess={onGoogleSuccess}
            onError={onGoogleError}
            theme="outline"
            size="large"
            shape="pill"
            text="signin_with"
          />
        </div>
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
  const handleCallbackResponse = useCallback(async (response: CredentialResponse) => {
    if (!response.credential) {
      setAuthError('Sign-in failed. Google did not return a credential.');
      return;
    }
    try {
      setAuthenticating(true);
      setAuthError(null);
      const idToken = response.credential;
      const data = await postWithWakeRetry<{ token: string }>(`${BACKEND}/api/auth/google`, { idToken });
      const token = data.token;
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

  // Google sign-in failed to even open (network/config issue, not a rejected login)
  const handleGoogleError = useCallback(() => {
    console.error('Google login error: popup failed to complete');
    setAuthError('Sign-in failed. Check console/network and env.');
  }, []);

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

  // Free-tier backend may still be waking up: explain the wait instead of looking frozen
  const [slowAuth, setSlowAuth] = useState(false);
  useEffect(() => {
    if (!authenticating) {
      setSlowAuth(false);
      return;
    }
    const t = setTimeout(() => setSlowAuth(true), 4000);
    return () => clearTimeout(t);
  }, [authenticating]);

  // Show loading state during auth
  if (authenticating) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--color-text-secondary)' }}>Signing in…</p>
          {slowAuth && (
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Waking up the server (free hosting) — this can take up to a minute the first time.
            </p>
          )}
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
      <HeroSection
        onScrollToFeatures={scrollToFeatures}
        onGoogleSuccess={handleCallbackResponse}
        onGoogleError={handleGoogleError}
      />
      <FeaturesSection />
      <FinalCTASection onGoogleSuccess={handleCallbackResponse} onGoogleError={handleGoogleError} />
    </main>
  );
}
