import { Activity, Shield, Phone, Mail } from "lucide-react";

const quickLinks = [
  { label: "Patient Resources", href: "#" },
  { label: "For Clinicians", href: "#" },
  { label: "Support", href: "#" },
];

const legalLinks = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Service", href: "#" },
  { label: "HIPAA Notice", href: "#" },
];

export default function FooterSection() {
  return (
    <footer className="border-t border-border/50 bg-card/30">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <span className="font-bold text-foreground">Emergency Copilot</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Voice-powered clinical documentation designed for emergency care professionals.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span>HIPAA Compliant</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-sm text-foreground mb-4">Resources</h4>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-sm text-foreground mb-4">Legal</h4>
            <ul className="space-y-2.5">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-sm text-foreground mb-4">Contact</h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="tel:1-800-555-0123"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  1-800-555-0123
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@emergencycopilot.com"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  support@emergencycopilot.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-border/50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Emergency Copilot. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground/60 text-center sm:text-right max-w-md">
              For clinical use only. This software is intended to assist healthcare professionals and does not replace clinical judgment.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
