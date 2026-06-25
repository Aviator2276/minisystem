import { useRef, useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { getCurrentUser, login } from "@/server/functions/auth"
import { KeyboardMusicIcon, ShieldIcon } from "lucide-react"

export const Route = createFileRoute("/login/")({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (user) throw redirect({ to: user.role === "admin" ? "/admin" : "/team" })
  },
  component: TeamLoginPage,
})

function TeamLoginPage() {
  const router = useRouter()
  const loginFn = useServerFn(login)
  const [pending, setPending] = useState(false)
  const [number, setNumber] = useState("")
  const passwordRef = useRef<HTMLInputElement>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    try {
      // the team username is the zero-padded two-digit team number
      const username = String(Number(number)).padStart(2, "0")
      await loginFn({
        data: { username, password: String(form.get("password")) },
      })
      await router.navigate({ to: "/team" })
    } catch {
      toast.error("Invalid team number or password")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyboardMusicIcon className="size-5" />
            Team sign in
          </CardTitle>
          <CardDescription>
            Enter your two-digit team number and the password your event admin
            gave you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={onSubmit}>
            <div className="flex flex-col items-center gap-2">
              <Label htmlFor="number">Team number</Label>
              <InputOTP
                id="number"
                maxLength={2}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                value={number}
                onChange={setNumber}
                // jump to the password field once both digits are in
                onComplete={() => passwordRef.current?.focus()}
                autoFocus
              >
                <InputOTPGroup className="gap-2">
                  <InputOTPSlot
                    index={0}
                    className="size-16 border-l text-3xl"
                  />
                  <InputOTPSlot
                    index={1}
                    className="size-16 border-l text-3xl"
                  />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                ref={passwordRef}
                required
              />
            </div>
            <Button type="submit" disabled={pending || number.length === 0}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <div className="h-px w-full bg-border" />
          <Button asChild variant="outline" className="w-full">
            <Link to="/login/admin">
              <ShieldIcon className="size-4" />
              Sign in as an admin
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
