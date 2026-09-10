import GradientWaves from "@/components/GradientWaves";
import "./TestPage.css";

export default function TestPage() {
  return (
    <section className="test-page" aria-label="Aperçu du fond animé">
      <GradientWaves
        className="test-page__waves"
        horizonColor="#7C3AED"
        waveColor="#FF9FFC"
        crestColor="#FFFFFF"
        speed={0.6}
        amplitude={1.9}
        waveScale={0.6}
        waveRatio={0.9}
        swell={19.5}
        turbulence={20}
        tilt={1.11}
        zoom={1.65}
        height={5.5}
        fogDepth={17}
        detail="medium"
        brightness={1}
        opacity={0.75}
        mouseInteraction={false}
        parallaxStrength={0.5}
        grain
        grainIntensity={0.05}
      />
      <div className="test-page__veil" aria-hidden="true" />

    </section>
  );
}