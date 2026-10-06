import React, { useState } from "react";
import { madameLine, sectionGreeting } from "@noelia-root/persona";
import AcademyScreen from "./screens/AcademyScreen";
import HomeScreen from "./screens/HomeScreen";
import ProfileScreen from "./screens/ProfileScreen";
import TrainingScreen from "./screens/TrainingScreen";
import WardrobeScreen from "./screens/WardrobeScreen";
import Madame, { MadameMood } from "./components/Madame";
import type { SectionId } from "./screens/section";
import {
  AppHeader,
  MobileNavigation,
  SideNavigation,
} from "./components/Navigation";
import "./app.css";

const screenTitles: Record<SectionId, string> = {
  home: "Home",
  academy: "Academy",
  training: "Training",
  wardrobe: "Wardrobe",
  profile: "Profile",
};

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SectionId>("home");
  const [madameMood, setMadameMood] = useState<MadameMood>("greeting");
  const [madameMessage, setMadameMessage] = useState(sectionGreeting("home"));
  const [guidanceCount, setGuidanceCount] = useState(0);

  const navigate = (section: SectionId): void => {
    setActiveSection(section);
    setMadameMood(section === "home" ? "greeting" : "idle");
    setMadameMessage(sectionGreeting(section));
  };

  const speakWithMadame = (): void => {
    setMadameMood("greeting");
    setMadameMessage(madameLine("greeting", String(guidanceCount)));
    setGuidanceCount((count) => count + 1);
  };

  const updateMadame = (mood: MadameMood, message: string): void => {
    setMadameMood(mood);
    setMadameMessage(message);
  };

  const renderScreen = (): React.ReactNode => {
    switch (activeSection) {
      case "home":
        return <HomeScreen onNavigate={navigate} />;
      case "academy":
        return <AcademyScreen onNavigate={navigate} />;
      case "training":
        return <TrainingScreen onMadameUpdate={updateMadame} />;
      case "wardrobe":
        return <WardrobeScreen onMadameUpdate={updateMadame} />;
      case "profile":
        return <ProfileScreen onNavigate={navigate} />;
    }
  };

  return (
    <div className="app-frame">
      <SideNavigation activeSection={activeSection} onNavigate={navigate} />
      <div className="app-column">
        <AppHeader activeTitle={screenTitles[activeSection]} />
        <main className="app-main">
          <Madame
            mood={madameMood}
            message={madameMessage}
            onSpeak={speakWithMadame}
          />
          <div className="screen-content" key={activeSection}>
            {renderScreen()}
          </div>
          <footer className="app-footer">
            <span>Noélia Academy</span>
            <span>Practice with grace <span aria-hidden="true">♡</span></span>
          </footer>
        </main>
      </div>
      <MobileNavigation activeSection={activeSection} onNavigate={navigate} />
    </div>
  );
};

export default App;
