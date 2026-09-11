import { NextResponse } from "next/server";
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:vetpamelak@gmail.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: Request) {
  try {
    const {
      subscription,
      title,
      body,
      delaySeconds = 0,
    } = await request.json();

    if (delaySeconds > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, delaySeconds * 1000)
      );
    }

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: title || "Meu Ritmo",
        body: body || "Você tem um lembrete.",
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao enviar push:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Falha ao enviar notificação.",
      },
      { status: 500 }
    );
  }
}