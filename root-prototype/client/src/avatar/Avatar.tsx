import React from "react";
import { AvatarAppearance, avatarLayerOrder } from "./avatarModel";
import "./Avatar.css";

type AvatarProps = {
  appearance: AvatarAppearance;
  size?: "portrait" | "stage";
  label?: string;
};

const Avatar: React.FC<AvatarProps> = ({
  appearance,
  size = "stage",
  label = "Layered ballerina avatar preview",
}) => (
  <div
    className={`layered-avatar avatar-size-${size}`}
    data-appearance={appearance.id}
    role="img"
    aria-label={label}
  >
    <span className="avatar-backdrop" aria-hidden="true" />
    {avatarLayerOrder.map((slot) => {
      const variant = appearance.layers[slot];
      return variant ? (
        <span
          className={`avatar-render-layer avatar-render-${slot}`}
          data-variant={variant}
          key={slot}
          aria-hidden="true"
        />
      ) : null;
    })}
  </div>
);

export default Avatar;
