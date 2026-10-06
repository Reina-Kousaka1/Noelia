import React, { useState } from "react";
import { wardrobeFeedback } from "@noelia-root/persona";
import Avatar from "../avatar/Avatar";
import { defaultDevAppearance, devAppearances } from "../avatar/devAppearances";
import { avatarLayerLabels, avatarLayerOrder } from "../avatar/avatarModel";
import type { MadameMood } from "../components/Madame";

type WardrobeScreenProps = {
  onMadameUpdate: (mood: MadameMood, message: string) => void;
};

const WardrobeScreen: React.FC<WardrobeScreenProps> = ({ onMadameUpdate }) => {
  const [appearanceId, setAppearanceId] = useState(defaultDevAppearance.id);
  const appearance = devAppearances.find((look) => look.id === appearanceId) ?? defaultDevAppearance;

  const previewAppearance = (id: string): void => {
    setAppearanceId(id);
    const selected = devAppearances.find((look) => look.id === id);
    if (selected) onMadameUpdate("approving", wardrobeFeedback(selected.id));
  };

  return (
    <section className="page-screen" aria-labelledby="wardrobe-title">
      <p className="screen-eyebrow">A PLACE FOR YOUR STUDIO LOOK</p>
      <h1 className="screen-title" id="wardrobe-title">Wardrobe</h1>
      <p className="screen-intro">
        A layered avatar foundation, ready for a future Noélia wardrobe connection.
      </p>

      <div className="preview-notice">
        <span aria-hidden="true">✧</span>
        <p>Local preview only. These examples are not inventory, are not saved, and do not change an account.</p>
      </div>

      <div className="wardrobe-layout">
        <article className="avatar-preview-card">
          <div className="avatar-preview-heading">
            <span className="home-hero-kicker">LAYERED AVATAR</span>
            <span className="local-preview-badge">LOCAL PREVIEW</span>
          </div>
          <div className="avatar-stage-wrap">
            <Avatar appearance={appearance} label={`${appearance.label} avatar preview`} />
          </div>
          <h2>{appearance.label}</h2>
          <p>{appearance.note}</p>
        </article>

        <div className="wardrobe-details">
          <section className="appearance-picker" aria-labelledby="appearance-title">
            <div className="wardrobe-section-heading">
              <p className="screen-eyebrow">DEVELOPMENT EXAMPLES</p>
              <h2 id="appearance-title">Preview a look</h2>
            </div>
            <div className="appearance-options">
              {devAppearances.map((look) => (
                <button
                  className={`appearance-option ${look.id === appearance.id ? "appearance-option-active" : ""}`}
                  type="button"
                  key={look.id}
                  onClick={() => previewAppearance(look.id)}
                  aria-pressed={look.id === appearance.id}
                >
                  <span className={`appearance-swatch swatch-${look.id}`} aria-hidden="true" />
                  <span>{look.label}</span>
                  <span className="appearance-check" aria-hidden="true">{look.id === appearance.id ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="layer-architecture" aria-labelledby="layers-title">
            <div className="wardrobe-section-heading">
              <p className="screen-eyebrow">AVATAR COMPONENT MODEL</p>
              <h2 id="layers-title">Separate visual layers</h2>
            </div>
            <p className="layer-intro">
              Each part renders independently in a fixed order. A future adapter can supply the appearance data.
            </p>
            <ol className="layer-list">
              {avatarLayerOrder.map((layer, index) => (
                <li key={layer}>
                  <span className="layer-index">0{index + 1}</span>
                  <span>{avatarLayerLabels[layer]}</span>
                  <span className="layer-preview-state">
                    {appearance.layers[layer] ? "Preview layer" : "Empty"}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </section>
  );
};

export default WardrobeScreen;
