import { FlaskConical } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { experimentalNavLabels } from '@/app/navigation'
import { useShowExperimental } from '@/hooks/useShowExperimental'

/**
 * Settings → Developer: shows or hides experimental features in the sidebar and search.
 * Rendered in every build (not only dev builds), so testers can opt in on release builds.
 */
export function ExperimentalFeaturesSettingsCard() {
  const { showExperimental, setShowExperimental } = useShowExperimental()
  const features = experimentalNavLabels()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-5" aria-hidden />
          Experimental features
        </CardTitle>
        <CardDescription>
          Features that are still being tested and may change. When hidden, they leave the sidebar and search;
          nothing already recorded is deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="show-experimental-toggle"
            checked={showExperimental}
            onChange={(e) => setShowExperimental(e.target.checked)}
            className="size-4 rounded border-border"
          />
          <Label htmlFor="show-experimental-toggle" className="font-medium">
            Show experimental features
          </Label>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground" aria-label="Experimental features">
          {features.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
