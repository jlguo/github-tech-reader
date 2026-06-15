from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.repo import Repo, ContentSection
from app.agents.crew import generate_book_chapter

router = APIRouter()


@router.post("/generate-chapter/{repo_id}")
async def generate_chapter(
    repo_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar()
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    if not repo.readme_content:
        raise HTTPException(status_code=400, detail="Fetch README first")

    background_tasks.add_task(
        _run_agent_and_save,
        repo_id=repo_id,
        repo_name=repo.full_name,
        repo_description=repo.description or "",
        readme_content=repo.readme_content,
    )

    return {"status": "processing", "repo_id": repo_id}


async def _run_agent_and_save(
    repo_id: str,
    repo_name: str,
    repo_description: str,
    readme_content: str,
):
    from app.core.database import async_session
    result = await generate_book_chapter(repo_name, repo_description, readme_content)

    async with async_session() as session:
        section = ContentSection(
            repo_id=repo_id,
            section_type="agent_output",
            title=f"Chapter: {repo_name}",
            content=result["output"],
            order_index=0,
        )
        session.add(section)
        await session.commit()
