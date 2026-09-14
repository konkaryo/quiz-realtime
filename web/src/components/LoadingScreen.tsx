import "./LoadingScreen.css";

type LoadingScreenProps = { hiding?: boolean };

export default function LoadingScreen({ hiding = false }: LoadingScreenProps) {
  return (
    <div className={`site-loading-screen${hiding ? " is-hiding" : ""}`} role="status" aria-label="Chargement du site" aria-live="polite">
      <img src="/landing/loader-mark-white.png" alt="" />
    </div>
  );
}