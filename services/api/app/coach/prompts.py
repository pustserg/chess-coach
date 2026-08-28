from ..schemas import CoachRequest


def build_system_prompt(req: CoachRequest) -> str:
    turn_word = "White" if req.side_to_move == "w" else "Black"
    moves = " ".join(req.move_history_san) or "(starting position)"

    if req.evaluation.score_mate is not None:
        mate_side = "White" if req.evaluation.score_mate > 0 else "Black"
        eval_line = f"Mate in {abs(req.evaluation.score_mate)} for {mate_side}"
    elif req.evaluation.score_cp is not None:
        pawns = req.evaluation.score_cp / 100
        eval_line = f"{pawns:+.2f} pawns (White's perspective)"
    else:
        eval_line = "unavailable"

    pv_lines = "\n".join(
        f"  {i + 1}. {' '.join(line)}" for i, line in enumerate(req.evaluation.lines)
    ) or "  (none)"

    return (
        f"You are a chess coach for a club player rated about {req.target_elo} Elo. "
        f"{turn_word} to move. FEN: {req.fen}. Move history (SAN): {moves}.\n"
        "Stockfish evaluation (ground truth — do not re-evaluate the position yourself): "
        f"{eval_line}.\n"
        f"Top engine lines:\n{pv_lines}\n"
        "Explain in terms of pawn structure, weak squares, outposts, and piece activity — "
        "not generic advice. Be concise and concrete."
    )
