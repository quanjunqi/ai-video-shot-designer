package project

import (
	"context"
	"errors"
	"testing"
)

// 项目 CRUD 收尾：Update/Delete/List 是 Create 之外的日常操作路径。
// Create/幂等/不可变已由 TestPostgresCreateReplayIsolationAndImmutability 覆盖。

func TestPostgresUpdateDeleteList(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	input := validInput()

	created, _, err := store.Create(ctx, "ws_crud", "actor", "key_crud", input)
	if err != nil {
		t.Fatal(err)
	}

	// Update：改标题，其余字段保留
	newTitle := "更新后的标题"
	updated, err := store.Update(ctx, "ws_crud", created.ID, UpdateInput{Title: &newTitle})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Title != newTitle {
		t.Fatalf("Update 应改名，实际 %q", updated.Title)
	}
	if updated.Status != "pending_parse" {
		t.Fatalf("Update 不应改变状态，实际 %q", updated.Status)
	}

	// List：按 workspace 返回且包含刚建项目
	list, err := store.List(ctx, "ws_crud", 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, p := range list.Items {
		if p.ID == created.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("List 应包含新建项目，实际 %+v", list.Items)
	}

	// Get 交叉验证
	got, err := store.Get(ctx, "ws_crud", created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != newTitle {
		t.Fatalf("Get 应取回更新后的标题，实际 %q", got.Title)
	}

	// Delete + 删除后 Get 应为 NotFound
	if err := store.Delete(ctx, "ws_crud", created.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, "ws_crud", created.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除后 Get 应返回 ErrNotFound，实际 %v", err)
	}
}

func TestPostgresUpdateNotFound(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	title := "x"
	if _, err := store.Update(ctx, "ws_none", "proj_none", UpdateInput{Title: &title}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("更新不存在的项目应返回 ErrNotFound，实际 %v", err)
	}
	if err := store.Delete(ctx, "ws_none", "proj_none"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除不存在的项目应返回 ErrNotFound，实际 %v", err)
	}
}
