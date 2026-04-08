import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Home from "@/pages/Home";
import SongGame from "@/pages/SongGame";
import XOGame from "@/pages/XOGame";
import WheelGame from "@/pages/WheelGame";
import QuizGame from "@/pages/QuizGame";
import SnakesGame from "@/pages/SnakesGame";
import FruitsGame from "@/pages/FruitsGame";
import ImposterGame from "@/pages/ImposterGame";
import ChairsGame from "@/pages/ChairsGame";
import AuthPage from "@/pages/AuthPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-pink-400/40 border-t-pink-400 rounded-full" />
      </div>
    );
  }
  if (!user) return <AuthPage />;
  return <Component />;
}

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-pink-400/40 border-t-pink-400 rounded-full" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/">{user ? <Home /> : <AuthPage />}</Route>
      <Route path="/song-game"><ProtectedRoute component={SongGame} /></Route>
      <Route path="/xo-game"><ProtectedRoute component={XOGame} /></Route>
      <Route path="/wheel-game"><ProtectedRoute component={WheelGame} /></Route>
      <Route path="/quiz"><ProtectedRoute component={QuizGame} /></Route>
      <Route path="/snakes-game"><ProtectedRoute component={SnakesGame} /></Route>
      <Route path="/fruits-game"><ProtectedRoute component={FruitsGame} /></Route>
      <Route path="/imposter-game"><ImposterGame /></Route>
      <Route path="/chairs-game"><ProtectedRoute component={ChairsGame} /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          {/* ── Global animated logo background ── */}
          <div className="rose-bg-layer" aria-hidden="true" />
          <div className="rose-bg-overlay" aria-hidden="true" />

          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
