import { useEffect, useRef, useState } from "react";
import { Camera, Eye, EyeOff, LockKeyhole, Mail, Save, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { notifyAuthUpdated } from "@/auth/events";
import { API_BASE, logout, updateAccount, updatePassword } from "@/auth/client";
import ShapeGrid from "../components/ShapeGrid";
import { useToast } from "../hooks/use-toast";
import "./Home.css";
import "./CreateRoomPage.css";
import "./AccountPage.css";

const PROFILE_AVATAR_UPDATED_EVENT = "profile-avatar-updated";
const FALLBACK_AVATAR = "/img/profiles/0.avif";

type MeUser = {
  email?: string | null;
  playerId?: string | null;
  playerName?: string | null;
  displayName?: string | null;
  img?: string | null;
  guest?: boolean;
};

function withCacheBust(url: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${Date.now()}`;
}

function avatarUploadError(error?: string) {
  if (error === "avatar_moderation_rejected") {
    return "Cette image ne peut pas être utilisée comme photo de profil.";
  }
  if (error === "avatar_moderation_unavailable") {
    return "Impossible de vérifier cette image pour le moment. Réessayez dans quelques instants.";
  }
  return "L’image de profil n’a pas pu être enregistrée.";
}

export default function AccountPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(FALLBACK_AVATAR);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [email, setEmail] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [initialEmail, setInitialEmail] = useState("");
  const [initialPlayerName, setInitialPlayerName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    void fetch(`${API_BASE}/auth/me`, { method: "GET", credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Impossible de charger le compte.");
        return response.json() as Promise<{ user?: MeUser }>;
      })
      .then(({ user = {} }) => {
        if (!mounted) return;
        setGuest(Boolean(user.guest));
        setPlayerId(user.playerId ?? null);
        const loadedEmail = String(user.email ?? "");
        const loadedPlayerName = String(user.playerName ?? user.displayName ?? "");
        setEmail(loadedEmail);
        setPlayerName(loadedPlayerName);
        setInitialEmail(loadedEmail);
        setInitialPlayerName(loadedPlayerName);
        setAvatar(user.img || FALLBACK_AVATAR);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        toast({
          title: "Compte indisponible",
          description: error instanceof Error ? error.message : "Impossible de charger le compte.",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [toast]);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  function selectAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Format non pris en charge", description: "Sélectionnez une image JPEG, PNG ou WebP.", variant: "destructive" });
      return;
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function uploadAvatar(file: File) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Impossible de lire cette image."));
        reader.readAsDataURL(file);
      });
      const response = await fetch(`${API_BASE}/auth/me/avatar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(avatarUploadError(errorPayload?.error));
      }
      const payload = (await response.json()) as { img?: string | null };
      const nextAvatar = withCacheBust(payload.img || avatar);
      setAvatar(nextAvatar);
      setAvatarFile(null);
      setAvatarPreview(null);
      if (playerId) window.localStorage.setItem(`profile-avatar:${playerId}`, nextAvatar);
      window.dispatchEvent(new CustomEvent(PROFILE_AVATAR_UPDATED_EVENT, { detail: { img: nextAvatar, playerId } }));
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changesPassword = Boolean(currentPassword || newPassword || confirmPassword);
    if (changesPassword && (!currentPassword || !newPassword || !confirmPassword)) {
      toast({ title: "Informations manquantes", description: "Complétez les trois champs du mot de passe.", variant: "destructive" });
      return;
    }
    if (changesPassword && newPassword !== confirmPassword) {
      toast({ title: "Mots de passe différents", description: "La confirmation doit être identique au nouveau mot de passe.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const accountUpdate = await updateAccount(email.trim(), playerName.trim());
      if (avatarFile) await uploadAvatar(avatarFile);
      if (changesPassword) {
        await updatePassword(currentPassword, newPassword);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
      notifyAuthUpdated();
      const savedEmail = String(accountUpdate.user?.email ?? initialEmail);
      setEmail(savedEmail);
      setInitialEmail(savedEmail);
      setInitialPlayerName(playerName.trim());
      toast(accountUpdate.emailVerificationSent
        ? { title: "Vérification envoyée", description: `Confirmez votre nouvelle adresse depuis l’e-mail envoyé à ${accountUpdate.pendingEmail}.` }
        : { title: "Compte enregistré", description: "Vos modifications ont bien été prises en compte." });
    } catch (error: unknown) {
      toast({ title: "Enregistrement impossible", description: error instanceof Error ? error.message : "Réessayez dans quelques instants.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      notifyAuthUpdated();
      navigate("/login", { replace: true });
    } catch {
      toast({
        title: "Déconnexion impossible",
        description: "Réessayez dans quelques instants.",
        variant: "destructive",
      });
      setLoggingOut(false);
    }
  }

  const hasChanges = Boolean(
    avatarFile
    || email.trim() !== initialEmail
    || playerName.trim() !== initialPlayerName
    || currentPassword
    || newPassword
    || confirmPassword
  );

  return (
    <div className="synapz-landing account-page">
      <ShapeGrid className="account-shape-grid" borderColor="#2f293a" hoverFillColor="#222222" shape="hexagon" direction="diagonal" squareSize={28} speed={0.1} hoverTrailAmount={0} />
      <header className="site-header account-header">
        <div className="site-header-inner">
          <div className="site-header-left">
            <Link className="brand" to="/"><img src="/landing/loader-mark-white.png" alt="" /><span>SYNAPZ</span></Link>
            <span className="nav-divider" aria-hidden="true">/</span>
            <nav className="site-nav" aria-label="Navigation principale"><Link to="/">Accueil</Link><Link to="/#salons">Jouer</Link><Link to="/multi/ranking">Classement</Link></nav>
          </div>
          <div className="header-actions"><button className="login-button account-logout" type="button" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? "Déconnexion…" : "Déconnexion"}</button></div>
        </div>
      </header>

      <main className="account-main">
        {loading ? (
          <div className="account-loading">Chargement du compte…</div>
        ) : guest ? (
          <section className="account-guest"><LockKeyhole size={20} /><div><strong>Compte invité</strong><p>Créez un compte pour personnaliser votre profil et sécuriser vos accès.</p></div><Link to="/register">Créer un compte</Link></section>
        ) : (
          <form className="account-settings-form" onSubmit={handleSave}>
          <div className="account-grid">
            <section className="account-card account-profile-card">
              <div className="account-avatar-editor">
                <button className="account-avatar" type="button" onClick={() => fileInputRef.current?.click()} aria-label="Choisir une nouvelle image de profil">
                  <img src={avatarPreview || avatar} alt="Aperçu de l’image de profil" onError={(event) => { event.currentTarget.src = FALLBACK_AVATAR; }} />
                  <span><Camera size={16} /></span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={selectAvatar} hidden />
                <button type="button" onClick={() => fileInputRef.current?.click()}>Modifier la photo</button>
              </div>
              <div className="account-profile-divider" />
              <div className="account-card-title"><UserRound size={17} /><h2>Profil</h2></div>
              <div className="account-form account-profile-form">
                <label><span>Nom du joueur</span><span className="account-input"><input type="text" value={playerName} onChange={(event) => setPlayerName(event.target.value)} minLength={1} maxLength={64} autoComplete="nickname" spellCheck={false} required /></span></label>
              </div>
            </section>

            <section className="account-card account-email-card">
              <div className="account-card-title"><Mail size={17} /><h2>Adresse e-mail</h2></div>
              <div className="account-form account-email-form">
                <label><span>Adresse e-mail</span><span className="account-input"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" spellCheck={false} required /></span></label>
              </div>
            </section>

            <section className="account-card account-password-card">
              <div className="account-card-title"><LockKeyhole size={17} /><h2>Mot de passe</h2></div>
              <div className="account-form account-password-form">
                <label><span>Mot de passe actuel</span><span className="account-input"><input type={showPasswords ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" spellCheck={false} /><button type="button" onClick={() => setShowPasswords((shown) => !shown)} aria-label={showPasswords ? "Masquer les mots de passe" : "Afficher les mots de passe"}>{showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
                <label><span>Nouveau mot de passe</span><span className="account-input"><input type={showPasswords ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" spellCheck={false} /></span></label>
                <label><span>Confirmer le mot de passe</span><span className="account-input"><input type={showPasswords ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" spellCheck={false} /></span></label>
              </div>
            </section>
          </div>
          <div className="account-save-area"><button className="create-room-save-action" type="submit" disabled={saving || !hasChanges}><Save size={15} /> {saving ? "Enregistrement…" : "Enregistrer"}</button></div>
          </form>
        )}
      </main>
    </div>
  );
}