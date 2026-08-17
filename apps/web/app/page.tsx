import ChessGame from "@/components/ChessGame";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full flex-1 items-center justify-center py-8">
        <ChessGame />
      </main>
    </div>
  );
}
